import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, ParamMap, Router } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { MIDI_STORAGE_KEY } from '../../desktop/model/model';
import { majorKeys } from '../../desktop/service/music-theory';
import { SeoService } from '../../shared/seo';
import { provideTesting } from '../../testing/test-providers';
import { getWeekOfYear } from '../exercices';
import { AgilityComponent } from './agility.component';
import { buildAgilitySeo } from './agility.seo';
import { exercises } from './pattern';

/** /exercises/agility/:selectedKey/:chordKey/:exerciseKey: arpeggio exercises on a chord in a key. */
describe('AgilityComponent', () => {
  let fixture: ComponentFixture<AgilityComponent>;
  let component: AgilityComponent;
  let el: HTMLElement;
  let navigate: ReturnType<typeof vi.fn>;
  let params$: BehaviorSubject<ParamMap>;
  const weekKey = majorKeys[getWeekOfYear() % majorKeys.length];

  function render(params: Record<string, string> = {}) {
    params$.next(convertToParamMap(params));
    fixture = TestBed.createComponent(AgilityComponent);
    component = fixture.componentInstance;
    el = fixture.nativeElement;
    fixture.detectChanges();
  }
  async function choose(id: string, label: string) {
    const select = el.querySelector(`#${id}`) as HTMLSelectElement;
    const option = [...select.options].find((o) => o.textContent?.trim().startsWith(label)) as HTMLOptionElement;
    select.value = option.value;
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    await fixture.whenStable();
  }

  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    params$ = new BehaviorSubject(convertToParamMap({}));
    TestBed.configureTestingModule({
      imports: [AgilityComponent],
      providers: [...provideTesting(), { provide: ActivatedRoute, useValue: { paramMap: params$ } }],
    });
    navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true) as unknown as ReturnType<typeof vi.fn>;
  });

  afterEach(() => {
    fixture?.destroy();
    localStorage.removeItem(MIDI_STORAGE_KEY);
  });

  it('without a URL, starts on the first exercise, a major chord, in the key of the week, and writes the URL', () => {
    const seo = vi.spyOn(TestBed.inject(SeoService), 'update');
    render();
    expect(component.availableChords.every((c) => c.pattern.length === exercises[0].patternSize)).toBe(true);
    expect(navigate).toHaveBeenCalledWith(['/', 'exercises', 'agility', weekKey, 'major', exercises[0].key], { replaceUrl: true });
    expect(seo.mock.calls.at(-1)?.[0].title).toBe(`${exercises[0].title}: ${weekKey} Major`);
  });

  it('opens the exercise, key and chord of the URL, without rewriting it', () => {
    render({ selectedKey: 'Eb', chordKey: 'minor', exerciseKey: exercises[1].key as string });
    expect(component.selectedExcercice).toBe(exercises[1]);
    expect(component.selectedKey).toBe('Eb');
    expect(component.selectedChord.name).toBe('Minor');
    expect(component.fullKey).toBe('e- minor');
    expect(navigate).not.toHaveBeenCalled();
  });

  it('keeps the defaults for parts of the URL it does not know', () => {
    render({ selectedKey: 'H', chordKey: 'augmented', exerciseKey: 'nothing' });
    expect(component.selectedExcercice).toBe(exercises[0]);
    expect(component.selectedKey).toBe(weekKey);
    expect(component.selectedChord.name).toBe('Major');
  });

  it('follows the key, chord and exercise selectors', async () => {
    render({ selectedKey: 'C', chordKey: 'major', exerciseKey: exercises[0].key as string });
    await choose('agility-key', 'Bb');
    expect(component.fullKey).toBe('B- major');
    expect(navigate).toHaveBeenLastCalledWith(['/', 'exercises', 'agility', 'Bb', 'major', exercises[0].key], { replaceUrl: true });
    await choose('agility-chord', 'Bb Minor');
    expect(component.fullKey).toBe('b- minor');
    expect(navigate).toHaveBeenLastCalledWith(['/', 'exercises', 'agility', 'Bb', 'minor', exercises[0].key], { replaceUrl: true });
    await choose('agility-exercise', exercises[1].title);
    expect(component.selectedChord.name).toBe('Major'); // chords filtered for the exercise, the first one selected
    expect(navigate).toHaveBeenLastCalledWith(['/', 'exercises', 'agility', 'Bb', 'major', exercises[1].key], { replaceUrl: true });
  });

  it('Start opens the exercise in the workbench', () => {
    render({ selectedKey: 'G', chordKey: 'major', exerciseKey: exercises[0].key as string });
    ([...el.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Start') as HTMLButtonElement).click();
    expect(navigate).toHaveBeenCalledWith(['/', 'workbench', 'agility', 'major', 'G', exercises[0].key], expect.objectContaining({ state: { fromStorage: true } }));
    expect(localStorage.getItem(MIDI_STORAGE_KEY)).toBeTruthy();
  });

  describe('SEO', () => {
    it('describes an exercise, a chord, or the agility page', () => {
      const full = buildAgilitySeo({ chordName: 'Major', chordKey: 'major', exerciseName: 'Arpeggios', exerciseKey: 'arpeggios', selectedKey: 'C' });
      expect(full.title).toBe('Arpeggios: C Major');
      expect(full.canonical).toBe('/exercises/agility/C/major/arpeggios');
      expect(full.structuredData).toMatchObject({ '@type': 'Course', teaches: 'Piano agility using the C Major chord in the Arpeggios pattern' });
      const chord = buildAgilitySeo({ chordName: 'Major', chordKey: 'major', selectedKey: 'C' });
      expect(chord.title).toBe('C Major Chord: Piano Agility Exercises');
      expect(chord.canonical).toBe('/exercises/agility');
      const page = buildAgilitySeo({});
      expect(page.title).toBe('Piano Agility Exercises: Technique & Finger Dexterity');
      expect(page.structuredData).not.toHaveProperty('teaches');
    });
  });
});
