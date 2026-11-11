import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { NEVER, of, throwError } from 'rxjs';
import { type GenreApiInfo, GenreService, type ScoreApiInfo, ScoreService } from '../../../core/api';
import { provideTesting } from '../../../testing/test-providers';
import { EditScoreComponent } from './edit-score.component';

const SCORE = {
  id: 's1',
  title: 'Gymnopédie No. 1',
  author: 'Erik Satie',
  author_id: 'mb-satie',
  genre_id: 'g-classical',
  grade: 3,
  tempo: 72,
  tracks_count: 2,
  study_tracks: [0, 1],
  immutableSlug: 'satie-gymnopedie',
} as ScoreApiInfo;
const GENRES = [{ id: 'g-classical', name: 'classical' }, { id: 'g-jazz', name: 'jazz' }] as GenreApiInfo[];

describe('EditScoreComponent', () => {
  let component: EditScoreComponent;
  let fixture: ComponentFixture<EditScoreComponent>;
  let el: HTMLElement;
  let scores: ScoreService;
  let navigate: ReturnType<typeof vi.spyOn>;
  let routeId: string | null;

  async function render({ score = of(SCORE) as unknown, genres = of(GENRES) as unknown } = {}) {
    vi.spyOn(scores, 'scoreIdGet').mockReturnValue(score as never);
    vi.spyOn(TestBed.inject(GenreService), 'genreGet').mockReturnValue(genres as never);
    fixture = TestBed.createComponent(EditScoreComponent);
    component = fixture.componentInstance;
    el = fixture.nativeElement;
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  const input = (id: string) => el.querySelector(`#${id}`) as HTMLInputElement;
  const button = (text: string) =>
    [...el.querySelectorAll('button')].find((b) => b.textContent?.trim().startsWith(text)) as HTMLButtonElement;
  function type(id: string, value: string) {
    input(id).value = value;
    input(id).dispatchEvent(new Event('input'));
    input(id).dispatchEvent(new Event('blur'));
    fixture.detectChanges();
  }

  beforeEach(async () => {
    routeId = 's1';
    await TestBed.configureTestingModule({
      imports: [EditScoreComponent],
      providers: [
        ...provideTesting(),
        { provide: ActivatedRoute, useFactory: () => ({ snapshot: { paramMap: convertToParamMap(routeId ? { id: routeId } : {}) } }) },
      ],
    }).compileComponents();
    scores = TestBed.inject(ScoreService);
    navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  describe('loading', () => {
    it('loads the score from the route id and fills the form', async () => {
      await render();
      expect(scores.scoreIdGet).toHaveBeenCalledWith('s1');
      expect(el.querySelector('.page-sub-title')?.textContent).toContain('Gymnopédie No. 1');
      expect(input('title').value).toBe('Gymnopédie No. 1');
      expect(input('tempo').value).toBe('72');
      expect(el.textContent).toContain('Erik Satie');
      expect(component.scoreForm.value).toMatchObject({ author_id: 'mb-satie', grade: 3, rightHandTrack: 0, leftHandTrack: 1 });
    });

    it('lists the genres and selects the score genre', async () => {
      await render();
      const select = el.querySelector('#genre_id') as HTMLSelectElement;
      expect([...select.options].map((o) => o.textContent?.trim())).toEqual(['— Select genre —', 'classical', 'jazz']);
      expect(select.disabled).toBe(false);
      expect(component.scoreForm.get('genre_id')?.value).toBe('g-classical');
    });

    it('keeps the genre list disabled while genres load', async () => {
      await render({ genres: NEVER });
      expect(component.scoreForm.get('genre_id')?.disabled).toBe(true);
      expect(el.textContent).toContain('Loading genres…');
    });

    it('still lets the user pick "no genre" when genres fail to load', async () => {
      await render({ genres: throwError(() => new Error('down')) });
      expect(component.scoreForm.get('genre_id')?.enabled).toBe(true);
      expect(component.genres).toEqual([]);
    });

    it('shows a spinner while the score loads', async () => {
      await render({ score: NEVER });
      expect(el.textContent).toContain('Loading score…');
      expect(el.querySelector('form')).toBeNull();
    });

    it('shows the error when the score cannot be loaded', async () => {
      await render({ score: throwError(() => new Error('Not found')) });
      expect(el.querySelector('.alert-error')?.textContent).toContain('Not found');
      expect(el.querySelector('form')).toBeNull();
    });

    it('complains without a score id', async () => {
      routeId = null;
      await render();
      expect(scores.scoreIdGet).not.toHaveBeenCalled();
      expect(el.querySelector('.alert-error')?.textContent).toContain('No score ID provided');
    });
  });

  describe('validation', () => {
    it('requires a title', async () => {
      await render();
      type('title', '');
      expect(el.textContent).toContain('title is required');
      expect(button('Save').disabled).toBe(true);
    });

    it('limits the title to 255 characters', async () => {
      await render();
      type('title', 'x'.repeat(256));
      expect(el.textContent).toContain('title is too long');
    });

    it.each([['20', 'tempo must be at least 30'], ['301', 'tempo must be at most 300']])(
      'rejects tempo %s', async (tempo, message) => {
        await render();
        type('tempo', tempo);
        expect(el.textContent).toContain(message);
        expect(button('Save').disabled).toBe(true);
      });

    it('marks every field touched instead of saving an invalid form', async () => {
      await render();
      component.scoreForm.patchValue({ title: '' });
      vi.spyOn(scores, 'scoreIdPut');
      component.onSubmit();
      expect(scores.scoreIdPut).not.toHaveBeenCalled();
      expect(component.scoreForm.get('title')?.touched).toBe(true);
    });
  });

  describe('saving', () => {
    beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));
    afterEach(() => vi.useRealTimers());

    it('sends the edited score with its study tracks, then returns to the score page', async () => {
      await render();
      const put = vi.spyOn(scores, 'scoreIdPut').mockReturnValue(of({ ...SCORE, title: 'Renamed' }) as never);
      type('title', 'Renamed');
      type('tempo', '90');
      button('Save').click();
      fixture.detectChanges();

      const [id, body] = put.mock.calls[0] as [string, Record<string, unknown>];
      expect(id).toBe('s1');
      expect(body).toMatchObject({ id: 's1', title: 'Renamed', tempo: 90, study_tracks: [0, 1] });
      expect(body).not.toHaveProperty('rightHandTrack');
      expect(body).not.toHaveProperty('leftHandTrack');
      expect(el.textContent).toContain('Score updated successfully!');

      vi.advanceTimersByTime(2000);
      expect(navigate).toHaveBeenCalledWith(['/score/satie-gymnopedie']);
    });

    it('leaves study_tracks out when no hand track is set', async () => {
      await render({ score: of({ ...SCORE, study_tracks: [] }) });
      const put = vi.spyOn(scores, 'scoreIdPut').mockReturnValue(of(SCORE) as never);
      component.onSubmit();
      expect((put.mock.calls[0][1] as ScoreApiInfo).study_tracks).toBeUndefined();
    });

    it('shows "Saving…" while the request runs', async () => {
      await render();
      vi.spyOn(scores, 'scoreIdPut').mockReturnValue(NEVER as never);
      component.onSubmit();
      fixture.detectChanges();
      expect(button('Saving…')).toBeDefined();
    });

    it('shows the error when saving fails, and stays on the page', async () => {
      await render();
      vi.spyOn(scores, 'scoreIdPut').mockReturnValue(throwError(() => new Error('Conflict')) as never);
      component.onSubmit();
      fixture.detectChanges();
      expect(el.querySelector('.alert-error')?.textContent).toContain('Conflict');
      vi.advanceTimersByTime(3000);
      expect(navigate).not.toHaveBeenCalled();
    });

    it('Cancel goes back to the score page', async () => {
      await render();
      button('← Cancel').click();
      expect(navigate).toHaveBeenCalledWith(['/score/satie-gymnopedie']);
    });
  });

  describe('author', () => {
    it('opens the search on a click on the author and applies the choice', async () => {
      await render();
      (el.querySelector('.cursor-pointer') as HTMLElement).click();
      expect(component.isAuthorModalOpen).toBe(true);

      component.onAuthorSelected({ author: 'Claude Debussy', author_id: 'mb-debussy' });
      fixture.detectChanges();
      expect(component.isAuthorModalOpen).toBe(false);
      expect(component.scoreForm.value).toMatchObject({ author: 'Claude Debussy', author_id: 'mb-debussy' });
      expect(el.textContent).toContain('Claude Debussy');
    });

    it('accepts an author without MusicBrainz id', async () => {
      await render();
      component.onAuthorSelected({ author: 'Anonymous', author_id: null });
      expect(component.scoreForm.value).toMatchObject({ author: 'Anonymous', author_id: null });
    });

    it('closes the search without changing the author', async () => {
      await render();
      component.openAuthorModal();
      component.closeAuthorModal();
      expect(component.isAuthorModalOpen).toBe(false);
      expect(component.scoreForm.value.author).toBe('Erik Satie');
    });
  });

  describe('deleting', () => {
    it('asks for confirmation, deletes, and goes to My Scores', async () => {
      await render();
      const del = vi.spyOn(scores, 'scoreIdDelete').mockReturnValue(of(undefined) as never);
      button('Delete').click();
      fixture.detectChanges();
      expect(el.textContent).toContain('This action cannot be undone. Are you sure?');

      (el.querySelector('.modal button.btn-danger') as HTMLButtonElement).click();
      expect(del).toHaveBeenCalledWith('s1');
      expect(navigate).toHaveBeenCalledWith(['/account/scores']);
    });

    it('can be cancelled', async () => {
      await render();
      const del = vi.spyOn(scores, 'scoreIdDelete');
      button('Delete').click();
      fixture.detectChanges();
      (el.querySelector('.modal button.btn-secondary') as HTMLButtonElement).click();
      fixture.detectChanges();
      expect(el.querySelector('.modal')).toBeNull();
      expect(del).not.toHaveBeenCalled();
    });

    it('shows the error and closes the dialog when deleting fails', async () => {
      await render();
      vi.spyOn(scores, 'scoreIdDelete').mockReturnValue(throwError(() => new Error('Forbidden')) as never);
      component.onDelete();
      component.confirmDelete();
      fixture.detectChanges();
      expect(el.querySelector('.modal')).toBeNull();
      expect(el.querySelector('.alert-error')?.textContent).toContain('Forbidden');
      expect(navigate).not.toHaveBeenCalled();
    });
  });

  describe('hand tracks', () => {
    it('offers one option per track of the score', async () => {
      await render();
      expect(component.getTrackOptions()).toEqual([0, 1]);
    });

    it('offers tracks 0 to 254 when the count is unknown', async () => {
      await render({ score: of({ ...SCORE, tracks_count: undefined }) });
      const options = component.getTrackOptions();
      expect([options.length, options[0], options.at(-1)]).toEqual([255, 0, 254]);
    });

    it('labels the default and selected tracks', async () => {
      await render({ score: of({ ...SCORE, study_tracks: [] }) });
      expect(component.getSelectedRightHandLabel()).toBe('default to midi track 0');
      expect(component.getSelectedLeftHandLabel()).toBe('default to midi track 1');
      component.selectRightHand(3);
      component.selectLeftHand(2);
      expect(component.getSelectedRightHandLabel()).toBe('Track 3');
      expect(component.getSelectedLeftHandLabel()).toBe('Track 2');
    });

    it('opens one dropdown at a time and closes them on an outside click', async () => {
      await render();
      component.toggleRightHandDropdown();
      component.toggleLeftHandDropdown();
      expect([component.showRightHandDropdown, component.showLeftHandDropdown]).toEqual([false, true]);
      component.toggleRightHandDropdown();
      expect([component.showRightHandDropdown, component.showLeftHandDropdown]).toEqual([true, false]);
      document.body.click();
      expect([component.showRightHandDropdown, component.showLeftHandDropdown]).toEqual([false, false]);
    });
  });
});
