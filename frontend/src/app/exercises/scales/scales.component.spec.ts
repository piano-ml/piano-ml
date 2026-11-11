import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, ParamMap, Router } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { MIDI_STORAGE_KEY } from '../../desktop/model/model';
import { majorKeys, minorKeys } from '../../desktop/service/music-theory';
import { SeoService } from '../../shared/seo';
import { provideTesting } from '../../testing/test-providers';
import { getWeekOfYear } from '../exercices';
import { exercises } from './pattern';
import { ScalesComponent } from './scales.component';
import { buildScalesSeo } from './scales.seo';

/** /exercises/scale/:selectedKey/:scaleKey/:exerciseKey: pick a scale, a key and an exercise, then Start. */
describe('ScalesComponent', () => {
  let fixture: ComponentFixture<ScalesComponent>;
  let component: ScalesComponent;
  let el: HTMLElement;
  let navigate: ReturnType<typeof vi.fn>;
  let params$: BehaviorSubject<ParamMap>;
  const weekKey = (keys: string[]) => keys[getWeekOfYear() % keys.length];

  function render(params: Record<string, string> = {}) {
    params$.next(convertToParamMap(params));
    fixture = TestBed.createComponent(ScalesComponent);
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
      imports: [ScalesComponent],
      providers: [...provideTesting(), { provide: ActivatedRoute, useValue: { paramMap: params$ } }],
    });
    navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true) as unknown as ReturnType<typeof vi.fn>;
  });

  afterEach(() => {
    fixture?.destroy();
    localStorage.removeItem(MIDI_STORAGE_KEY);
  });

  it('without a URL, starts on the major scale in the key of the week and writes that in the URL', () => {
    const seo = vi.spyOn(TestBed.inject(SeoService), 'update');
    render();
    const key = weekKey(majorKeys);
    expect(navigate).toHaveBeenCalledWith(['/', 'exercises', 'scale', key, 'major', exercises[2].key], { replaceUrl: true });
    expect(seo.mock.calls.at(-1)?.[0].title).toBe(`${key} Major Scale: ${exercises[2].title}`);
  });

  it('opens the scale, key and exercise of the URL (minor keys case-insensitively), without rewriting it', () => {
    render({ selectedKey: 'f#m', scaleKey: 'minor', exerciseKey: 'contrary_motion' });
    expect(component.selectedScale.name).toBe('Minor');
    expect(component.keys).toBe(minorKeys);
    expect(component.selectedKey).toBe('F#m');
    expect(component.selectedExcercice.key).toBe('contrary_motion');
    expect(component.fullKey).toBe('f# minor');
    expect(navigate).not.toHaveBeenCalled();
  });

  it('keeps the defaults for parts of the URL it does not know', () => {
    render({ selectedKey: 'H', scaleKey: 'bebop', exerciseKey: 'nothing' });
    expect(component.selectedScale.name).toBe('Major');
    expect(component.selectedExcercice).toBe(exercises[2]);
    expect(component.selectedKey).toBe(weekKey(majorKeys));
  });

  it('switching to the minor scale lists the minor keys and picks the minor key of the week', async () => {
    render({ selectedKey: 'G', scaleKey: 'major', exerciseKey: 'contrary_motion' });
    await choose('select-scale', 'Minor');
    expect(component.keys).toBe(minorKeys);
    expect(component.selectedKey).toBe(weekKey(minorKeys));
    expect(navigate).toHaveBeenLastCalledWith(['/', 'exercises', 'scale', weekKey(minorKeys), 'minor', 'contrary_motion'], { replaceUrl: true });
  });

  it('follows the key and exercise selectors, writing flats the music21 way', async () => {
    render({ selectedKey: 'G', scaleKey: 'major', exerciseKey: 'contrary_motion' });
    await choose('select-key', 'Bb');
    expect(component.fullKey).toBe('B- major');
    expect(navigate).toHaveBeenLastCalledWith(['/', 'exercises', 'scale', 'Bb', 'major', 'contrary_motion'], { replaceUrl: true });
    await choose('select-exercise', exercises[0].title);
    expect(navigate).toHaveBeenLastCalledWith(['/', 'exercises', 'scale', 'Bb', 'major', exercises[0].key], { replaceUrl: true });
  });

  it('Start opens the exercise in the workbench', () => {
    render({ selectedKey: 'D', scaleKey: 'major', exerciseKey: 'parallel_motion_in_octaves' });
    ([...el.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Start') as HTMLButtonElement).click();
    expect(navigate).toHaveBeenCalledWith(['/', 'workbench', 'scale', 'major', 'D', 'parallel_motion_in_octaves'], expect.objectContaining({ state: { fromStorage: true } }));
    expect(localStorage.getItem(MIDI_STORAGE_KEY)).toBeTruthy();
  });

  it('links to the library scores in the same key', () => {
    render({ selectedKey: 'F#', scaleKey: 'major', exerciseKey: 'contrary_motion' });
    expect(component.getLibraryUrl()).toBe('/library/popular?fullKey=F%23%20Major');
  });

  describe('SEO', () => {
    it('describes an exercise, a scale, or the exercises page', () => {
      const full = buildScalesSeo({ scaleName: 'Minor', scaleKey: 'minor', exerciseName: 'Contrary motion', exerciseKey: 'contrary_motion', selectedKey: 'Am' });
      expect(full.title).toBe('Am Minor Scale: Contrary motion');
      expect(full.canonical).toBe('/exercises/scale/Am/minor/contrary_motion');
      const scale = buildScalesSeo({ scaleName: 'Minor', scaleKey: 'minor', selectedKey: 'Am' });
      expect(scale.title).toBe('Am Minor Scale: Piano Exercises');
      expect(scale.canonical).toBe('/exercises/scale/Am/minor');
      const page = buildScalesSeo({});
      expect(page.title).toBe('Piano Scale Exercises: Major & Minor Scales');
      expect(page.canonical).toBe('/exercises/scale');
      expect(page.structuredData).toMatchObject({ '@type': 'LearningResource', name: page.title });
    });
  });
});
