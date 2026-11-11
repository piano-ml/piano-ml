import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { ScoreService } from '../../core/api/api/score.service';
import type { ScoreApiInfo } from '../../core/api';
import { exercises as agilityExercises } from '../../exercises/agility/pattern';
import { exercises as scaleExercises } from '../../exercises/scales/pattern';
import { provideTesting } from '../../testing/test-providers';
import { ExercisesInKeyComponent } from './exercises-in-key/exercises-in-key.component';
import { PopularScoresInKeyComponent } from './popular-scores-in-key/popular-scores-in-key.component';

/** Score page boxes linking to exercises and popular scores in the score's key ("C# major", "B- minor"...). */
describe('ExercisesInKeyComponent', () => {
  let fixture: ComponentFixture<ExercisesInKeyComponent>;
  let component: ExercisesInKeyComponent;

  function render(fullKey: string | undefined) {
    fixture = TestBed.createComponent(ExercisesInKeyComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('fullKey', fullKey);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }
  const hrefs = (el: HTMLElement) => [...el.querySelectorAll('a')].map((a) => a.getAttribute('href'));
  const agility = (key: string) => component.exercises.find((e) => e.exerciseType === 'agility' && e.key === key)!;
  const scale = (key: string) => component.exercises.find((e) => e.exerciseType === 'scale' && e.key === key)!;

  it('lists every agility and scale exercise', () => {
    const el = render('C major');
    expect(component.exercises).toHaveLength(agilityExercises.length + scaleExercises.length);
    expect(el.querySelectorAll('a')).toHaveLength(component.exercises.length);
    expect(el.textContent).toContain('Practice Exercises in this Scale');
  });

  it('shows nothing without a key', () => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const el = render(undefined);
    expect(el.querySelector('a')).toBeNull();
  });

  it.each([
    ['C major', '/exercises/agility/C/major/two_octave_arpeggios', '/exercises/scale/C/major/contrary_motion'],
    ['a minor', '/exercises/agility/A/minor/two_octave_arpeggios', '/exercises/scale/Am/minor/contrary_motion'],
    ['B- major', '/exercises/agility/Bb/major/two_octave_arpeggios', '/exercises/scale/Bb/major/contrary_motion'],
    ['f# minor', '/exercises/agility/F%23/minor/two_octave_arpeggios', '/exercises/scale/F%23m/minor/contrary_motion'],
  ])('links %s exercises to the matching routes', (fullKey, agilityUrl, scaleUrl) => {
    const el = render(fullKey);
    expect(component.getExerciseUrl(agility('two_octave_arpeggios'))).toBe(agilityUrl);
    expect(component.getExerciseUrl(scale('contrary_motion'))).toBe(scaleUrl);
    expect(hrefs(el)).toContain(agilityUrl);
  });

  it('links to # when the key cannot be read, or the exercise has no key', () => {
    render('C');
    expect(component.getExerciseUrl(agility('two_octave_arpeggios'))).toBe('#');
    expect(component.getExerciseUrl({ ...agility('two_octave_arpeggios'), key: '' })).toBe('#');
  });

  it('labels the exercise types', () => {
    render('C major');
    expect([component.getExerciseTypeLabel('agility'), component.getExerciseTypeLabel('scale')]).toEqual(['Agility', 'Scales']);
  });
});

describe('PopularScoresInKeyComponent', () => {
  let search: ReturnType<typeof vi.spyOn>;

  function render(fullKey: string | undefined, limit?: number) {
    const fixture = TestBed.createComponent(PopularScoresInKeyComponent);
    fixture.componentRef.setInput('fullKey', fullKey);
    if (limit) fixture.componentRef.setInput('limit', limit);
    fixture.detectChanges();
    return { el: fixture.nativeElement as HTMLElement, component: fixture.componentInstance };
  }

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: provideTesting() });
    search = vi.spyOn(TestBed.inject(ScoreService), 'scoreSearchGet');
  });

  it('lists the most popular scores in the key, linking to them and to the full list', () => {
    search.mockReturnValue(of([
      { title: 'Für Elise', author: 'Beethoven', immutableSlug: 'fur-elise' },
      { title: 'Draft', mutableSlug: 'draft' },
      { title: 'No slug' },
    ] as ScoreApiInfo[]) as never);
    const { el } = render('a minor', 3);
    const args = search.mock.calls[0];
    expect([args[10], args[12], args[13]]).toEqual(['a minor', 0, 3]); // fullKey, offset, limit
    expect([...el.querySelectorAll('.popular-score-pill')].map((a) => a.getAttribute('href'))).toEqual(['/score/fur-elise', '/score/draft', '#']);
    expect(el.querySelector('.popular-score-author')?.textContent).toBe('Beethoven');
    expect(el.querySelector('.popular-scores-view-all')?.getAttribute('href')).toBe('/library/popular?fullKey=a%20minor');
  });

  it('shows nothing when no score is in the key, or the search fails', () => {
    search.mockReturnValue(of([]) as never);
    expect(render('C major').el.querySelector('section')).toBeNull();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    search.mockReturnValue(throwError(() => new Error('down')) as never);
    const { el, component } = render('C major');
    expect(el.querySelector('section')).toBeNull();
    expect(component.loadingScores).toBe(false);
  });

  it('does not search without a key', () => {
    render(undefined);
    expect(search).not.toHaveBeenCalled();
  });
});
