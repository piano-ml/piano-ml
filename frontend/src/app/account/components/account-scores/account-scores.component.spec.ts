import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { Subject, of, throwError } from 'rxjs';
import { type ScoreApiInfo, ScoreService } from '../../../core/api';
import { provideTesting } from '../../../testing/test-providers';
import { AuthService } from '../../services/auth.service';
import { AccountScoresComponent } from './account-scores.component';

const score = (overrides: Partial<ScoreApiInfo>): ScoreApiInfo => ({
  id: 's1',
  title: 'Gymnopédie No. 1',
  author: 'Erik Satie',
  genre: 'classical',
  version: 1,
  playCount: 3,
  has_files: true,
  publicDomain: true,
  immutableSlug: 'satie-gymnopedie-no-1',
  uploaded_at: '2026-11-10T12:00:00Z',
  ...overrides,
}) as ScoreApiInfo;

const PUBLIC = score({ id: 'pd', title: 'Gymnopédie No. 1', publicDomain: true, immutableSlug: 'satie-gymnopedie' });
const COPYRIGHTED = score({ id: 'cr', title: 'Tears in Heaven', author: 'Eric Clapton', publicDomain: false, immutableSlug: 'clapton-tears' });

describe('AccountScoresComponent', () => {
  let fixture: ComponentFixture<AccountScoresComponent>;
  let searchScores: ReturnType<typeof vi.spyOn>;
  let userId: string | null;

  /** Creates the component; `scores` is what the API answers (an Observable to control timing). */
  function render(scores: ReturnType<ScoreService['scoreSearchGet']> | ScoreApiInfo[]) {
    searchScores.mockReturnValue(Array.isArray(scores) ? of(scores) : scores);
    fixture = TestBed.createComponent(AccountScoresComponent);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  const rows = (el: HTMLElement) => [...el.querySelectorAll('tbody tr')] as HTMLTableRowElement[];
  const headers = (el: HTMLElement) => [...el.querySelectorAll('thead th')].map((th) => th.textContent?.trim());
  /** Cell of `row` under the header `label`. */
  const cell = (el: HTMLElement, row: HTMLTableRowElement, label: string) =>
    row.cells[headers(el).indexOf(label)] as HTMLTableCellElement;

  beforeEach(async () => {
    userId = 'u1';
    await TestBed.configureTestingModule({
      imports: [AccountScoresComponent],
      providers: provideTesting(),
    }).compileComponents();
    vi.spyOn(TestBed.inject(AuthService), 'getUserId').mockImplementation(() => userId);
    searchScores = vi.spyOn(TestBed.inject(ScoreService), 'scoreSearchGet');
  });

  describe('loading the list', () => {
    it("asks for the logged-in user's scores and lists one row each, with a count", () => {
      const el = render([PUBLIC, COPYRIGHTED]);
      expect(searchScores).toHaveBeenCalledWith(undefined, 'u1');
      expect(rows(el)).toHaveLength(2);
      expect(el.textContent).toContain('2 scores');
    });

    it('uses the singular for a single score', () => {
      const el = render([PUBLIC]);
      expect(el.textContent).toContain('1 score');
      expect(el.textContent).not.toContain('1 scores');
    });

    it('shows the loading message until the scores arrive', () => {
      const pending = new Subject<ScoreApiInfo[]>();
      const el = render(pending as never);
      expect(el.textContent).toContain('Loading your scores…');
      expect(rows(el)).toHaveLength(0);

      pending.next([PUBLIC]);
      fixture.detectChanges();
      expect(el.textContent).not.toContain('Loading your scores…');
      expect(rows(el)).toHaveLength(1);
    });

    it('invites to upload a first score when there is none', () => {
      const el = render([]);
      expect(el.textContent).toContain('No scores yet — upload your first MIDI file to get started.');
      expect(el.textContent).not.toMatch(/\d+ scores?/);
    });

    it('shows the API error instead of the table', () => {
      const el = render(throwError(() => new Error('Service unavailable')) as never);
      expect(el.querySelector('.alert-error')?.textContent).toContain('Service unavailable');
      expect(el.querySelector('table')).toBeNull();
    });

    it('does not call the API without a logged-in user', () => {
      userId = null;
      const el = render([PUBLIC]);
      expect(searchScores).not.toHaveBeenCalled();
      expect(el.querySelector('.alert-error')?.textContent).toContain('User not authenticated');
    });
  });

  describe('public domain column', () => {
    it('shows an open green padlock for a public-domain score', () => {
      const el = render([PUBLIC]);
      const badge = cell(el, rows(el)[0], 'Public domain').querySelector('.cell-icon') as HTMLElement;
      expect(badge.classList).toContain('cell-icon--positive');
      expect(badge.dataset['icon']).toBe('bootstrapUnlockFill');
      expect(badge.title).toBe('Public domain');
      expect(badge.textContent?.trim()).toBe('Public domain'); // screen-reader text
    });

    it('shows a closed padlock for a copyrighted score', () => {
      const el = render([COPYRIGHTED]);
      const badge = cell(el, rows(el)[0], 'Public domain').querySelector('.cell-icon') as HTMLElement;
      expect(badge.classList).toContain('cell-icon--caution');
      expect(badge.dataset['icon']).toBe('bootstrapLockFill');
      expect(badge.title).toBe('Copyrighted, downloads restricted');
    });

    it('treats a score without the flag as copyrighted', () => {
      const el = render([score({ publicDomain: undefined })]);
      const badge = cell(el, rows(el)[0], 'Public domain').querySelector('.cell-icon') as HTMLElement;
      expect(badge.dataset['icon']).toBe('bootstrapLockFill');
      expect(badge.querySelector('ng-icon svg')).not.toBeNull(); // the icon really renders
    });

    it('no longer prefixes copyrighted titles with a padlock emoji', () => {
      const el = render([COPYRIGHTED]);
      expect(cell(el, rows(el)[0], 'Title').textContent?.trim()).toBe('Tears in Heaven');
    });
  });

  describe('other columns', () => {
    it('has no status column any more: #played comes first', () => {
      const el = render([PUBLIC]);
      expect(headers(el)[0]).toBe('#played');
      expect(el.textContent).not.toContain('✅');
    });

    it('shows a red warning triangle instead of the play count when the files are missing', () => {
      const el = render([score({ id: 'broken', has_files: false, playCount: 7 })]);
      const played = cell(el, rows(el)[0], '#played');
      const badge = played.querySelector('.cell-icon') as HTMLElement;
      expect(badge.dataset['icon']).toBe('bootstrapExclamationTriangleFill');
      expect(badge.classList).toContain('cell-icon--danger');
      expect(badge.title).toBe('Files missing: the import did not finish');
      expect(played.textContent).not.toContain('7');
    });

    it('shows the play count when the files are there (or not reported)', () => {
      const el = render([score({ has_files: true, playCount: 7 }), score({ id: 's2', has_files: undefined, playCount: 0 })]);
      expect(cell(el, rows(el)[0], '#played').textContent?.trim()).toBe('7');
      expect(cell(el, rows(el)[1], '#played').textContent?.trim()).toBe('0');
      expect(el.querySelectorAll('[data-icon="bootstrapExclamationTriangleFill"]')).toHaveLength(0);
    });

    it('lists play count, version, author and genre', () => {
      const el = render([COPYRIGHTED]);
      const row = rows(el)[0];
      expect(cell(el, row, '#played').textContent?.trim()).toBe('3');
      expect(cell(el, row, 'Version').textContent?.trim()).toBe('1');
      expect(cell(el, row, 'Author').textContent?.trim()).toBe('Eric Clapton');
      expect(cell(el, row, 'Genre').textContent?.trim()).toBe('classical');
    });
  });

  describe('navigation', () => {
    it('opens the score page when a row is clicked', () => {
      const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
      const el = render([PUBLIC, COPYRIGHTED]);
      rows(el)[1].click();
      expect(navigate).toHaveBeenCalledWith(['/score', 'clapton-tears']);
    });

    it('opens the score in a new tab on ctrl/cmd-click', () => {
      const open = vi.spyOn(window, 'open').mockReturnValue(null);
      const el = render([PUBLIC]);
      rows(el)[0].dispatchEvent(new MouseEvent('click', { ctrlKey: true, bubbles: true }));
      expect(open).toHaveBeenCalledWith('/score/satie-gymnopedie', '_blank', 'noopener');
    });

    it('falls back to the mutable slug', () => {
      const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
      const el = render([score({ immutableSlug: undefined, mutableSlug: 'satie-draft' })]);
      rows(el)[0].click();
      expect(navigate).toHaveBeenCalledWith(['/score', 'satie-draft']);
    });

    it('"Browse library" goes to the library', () => {
      const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
      const el = render([PUBLIC]);
      const browse = [...el.querySelectorAll('button')].find((b) => b.textContent?.includes('Browse library'));
      browse?.click();
      expect(navigate).toHaveBeenCalledWith(['/library']);
    });
  });
});
