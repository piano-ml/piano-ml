import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { BeaconService } from 'ng-beacon';
import { BehaviorSubject, Observable, of, throwError } from 'rxjs';
import { ScoreService } from '../../../core/api/api/score.service';
import { AuthorWithScoreCount } from '../../../core/api/model/authorWithScoreCount';
import { ScoreApiInfo } from '../../../core/api/model/scoreApiInfo';
import { ScoreGenreBrowseGet200ResponseInner } from '../../../core/api/model/scoreGenreBrowseGet200ResponseInner';
import { ResponseStatusService, SeoService } from '../../../shared/seo';
import { provideTesting } from '../../../testing/test-providers';
import { BrowseComponent } from './browse.component';

/** The library page: search, filters (grade slider, hands, key), tabs, artist / genre pages, paging. */
describe('BrowseComponent', () => {
  let fixture: ComponentFixture<BrowseComponent>;
  let component: BrowseComponent;
  let el: HTMLElement;
  let navigate: ReturnType<typeof vi.fn>;
  /** The ActivatedRoute the component gets: render() sets its URL tab, params and query params. */
  const route = {
    snapshot: { url: [] as { path: string }[] },
    params: new BehaviorSubject<Record<string, string>>({}),
    queryParams: new BehaviorSubject<Record<string, string>>({}),
  };
  let api: {
    scoreGetFullKeyGet: ReturnType<typeof vi.fn>;
    scoreStatsGet: ReturnType<typeof vi.fn>;
    scoreSearchGet: ReturnType<typeof vi.fn>;
    scoreAuthorBrowseGet: ReturnType<typeof vi.fn>;
    scoreGenreBrowseGet: ReturnType<typeof vi.fn>;
  };

  const score = (n: number, extra: Partial<ScoreApiInfo> = {}) =>
    ({ id: `s${n}`, title: `Score ${n}`, immutableSlug: `score-${n}`, ...extra }) as ScoreApiInfo;
  const page = (from: number, count: number) => Array.from({ length: count }, (_, i) => score(from + i));
  const SATIE: AuthorWithScoreCount = { author: { name: 'Erik Satie', slug: 'satie-erik', sortName: 'Satie, Erik' }, count: 12 } as AuthorWithScoreCount;
  const BACH: AuthorWithScoreCount = { author: { name: 'J. S. Bach', slug: 'bach', sortName: 'Bach, Johann Sebastian' }, count: 1 } as AuthorWithScoreCount;
  const BAROQUE: ScoreGenreBrowseGet200ResponseInner = { genre: { id: 'g1', name: 'baroque', slug: 'baroque' }, count: 3 } as ScoreGenreBrowseGet200ResponseInner;

  /** Arguments of the last scoreSearchGet call, by name. */
  function lastSearch() {
    const a = api.scoreSearchGet.mock.calls.at(-1) ?? [];
    return { keyword: a[0], artistSlug: a[4], genreSlug: a[5], gradeStart: a[7], gradeEnd: a[8], fullKey: a[10], sortBy: a[11], offset: a[12], limit: a[13], tracks: a[14] };
  }

  const settle = () => new Promise((resolve) => setTimeout(resolve));
  async function render(tab: string | null = 'genres', params: Record<string, string> = {}, query: Record<string, string> = {}) {
    route.snapshot.url = tab ? [{ path: tab }] : [];
    route.params = new BehaviorSubject(params);
    route.queryParams = new BehaviorSubject(query);
    fixture = TestBed.createComponent(BrowseComponent);
    component = fixture.componentInstance;
    el = fixture.nativeElement;
    fixture.detectChanges();
    await settle();
    fixture.detectChanges();
    await settle();
  }
  const button = (text: string) => [...el.querySelectorAll('button')].find((b) => b.textContent?.trim() === text) as HTMLButtonElement;

  beforeEach(() => {
    localStorage.setItem('browse-tour-seen', 'true');
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    api = {
      scoreGetFullKeyGet: vi.fn(() => of(['G major', 'C major', 'A minor'])),
      scoreStatsGet: vi.fn(() => of({ 'public-domain': 1200, copyrighted: 34 })),
      scoreSearchGet: vi.fn(() => of(page(1, 3))),
      scoreAuthorBrowseGet: vi.fn((): Observable<AuthorWithScoreCount[]> => of([SATIE, BACH])),
      scoreGenreBrowseGet: vi.fn((): Observable<ScoreGenreBrowseGet200ResponseInner[]> => of([BAROQUE])),
    };
    TestBed.configureTestingModule({
      imports: [BrowseComponent],
      providers: [...provideTesting(), { provide: ScoreService, useValue: api }, { provide: ActivatedRoute, useValue: route }],
    });
    navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true) as unknown as ReturnType<typeof vi.fn>;
  });

  afterEach(() => {
    fixture?.destroy();
    localStorage.removeItem('browse-tour-seen');
  });

  describe('opening the library', () => {
    it('loads the keys (sorted) and the stats, then the scores, and shows how many there are', async () => {
      const seo = vi.spyOn(TestBed.inject(SeoService), 'update');
      await render('popular');
      expect(component.fullKeyOptions).toEqual(['A minor', 'C major', 'G major']);
      expect(el.textContent).toContain('1,234 scores in database');
      expect(lastSearch()).toMatchObject({ keyword: undefined, sortBy: undefined, offset: 0, limit: 100, tracks: undefined, gradeStart: undefined });
      expect(el.textContent).toContain('Showing 3 scores');
      expect(seo).toHaveBeenCalled();
    });

    it('sorts the "new" tab by upload date', async () => {
      await render('new');
      expect(lastSearch().sortBy).toBe('uploadedAt_desc');
      expect(el.querySelector('h2')?.textContent).toContain('Latest Piano Scores');
    });

    it('defaults to the genres tab, which lists the genres', async () => {
      await render(null);
      expect(component.activeTab).toBe('genres');
      expect(el.textContent).toContain('baroque');
      expect(el.textContent).toContain('3 scores');
    });

    it('still loads the scores when the keys and stats cannot be loaded', async () => {
      api.scoreGetFullKeyGet.mockReturnValue(throwError(() => new Error('down')));
      api.scoreStatsGet.mockReturnValue(throwError(() => new Error('down')));
      await render('popular');
      expect(component.fullKeyOptions).toEqual([]);
      expect(component.stats).toBeNull();
      expect(api.scoreSearchGet).toHaveBeenCalled();
    });

    it('stops loading when the scores cannot be loaded', async () => {
      api.scoreSearchGet.mockReturnValue(throwError(() => new Error('down')));
      await render('popular');
      expect(component.loading).toBe(false);
      expect(component.scores).toEqual([]);
    });
  });

  describe('filters in the URL', () => {
    it('applies hands, key and grade range, raising an end below the start', async () => {
      await render('popular', {}, { oneHand: 'true', twoHands: 'true', fullKey: 'C major', gradeStart: '5', gradeEnd: '3' });
      expect(lastSearch()).toMatchObject({ tracks: [1, 2], fullKey: 'C major', gradeStart: '5', gradeEnd: '5' });
      expect(component.gradeFilterPristine).toBe(false);
    });

    it('ignores invalid grades and clamps out-of-range ones', async () => {
      await render('popular', {}, { gradeStart: 'abc', gradeEnd: '42' });
      expect([component.selectedGradeStart, component.selectedGradeEnd]).toEqual([1, 8]);
      expect(lastSearch()).toMatchObject({ gradeStart: undefined, gradeEnd: undefined });
    });

    it('searches the keyword of ?search=, and Clear goes back to the tab', async () => {
      await render('new', {}, { search: 'gnossienne' });
      expect(lastSearch().keyword).toBe('gnossienne');
      expect(el.querySelector('h2')?.textContent).toContain('Piano Score Search Results');
      expect(el.querySelector('nav')).toBeNull(); // no tabs while searching
      button('Clear').click();
      expect(navigate).toHaveBeenCalledWith(['/library/new']);
      expect(lastSearch().keyword).toBeUndefined();
      expect(component.searchKeyword).toBe('');
    });
  });

  describe('searching', () => {
    it('searches what was typed, keeping the filters in the URL', async () => {
      await render('popular');
      component.filterOneHand = true;
      const input = el.querySelector('#browse-search-keyword') as HTMLInputElement;
      input.value = 'satie';
      input.dispatchEvent(new Event('input'));
      input.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter' }));
      expect(navigate).toHaveBeenCalledWith(['/library/popular'], {
        queryParams: { search: 'satie', oneHand: true, twoHands: null, fullKey: null, gradeStart: null, gradeEnd: null },
      });
      expect(lastSearch()).toMatchObject({ keyword: 'satie', tracks: [1] });
    });
  });

  describe('an artist page (/library/artists/:artistSlug)', () => {
    it('looks the artist up, then lists their scores', async () => {
      api.scoreAuthorBrowseGet.mockReturnValue(of([SATIE]));
      await render('artists', { artistSlug: 'satie-erik' });
      expect(api.scoreAuthorBrowseGet.mock.calls.some((c) => c[4] === 'satie-erik')).toBe(true);
      expect(lastSearch().artistSlug).toBe('satie-erik');
      expect(el.textContent).toContain('Erik Satie');
      expect(el.textContent).toContain('(12 scores)');
      expect(el.querySelector('h2')?.textContent).toContain('Erik Satie Piano Works Collection');
    });

    it('answers 404 (noindex) for an unknown artist, but still lists the library', async () => {
      api.scoreAuthorBrowseGet.mockReturnValue(of([]));
      const status = vi.spyOn(TestBed.inject(ResponseStatusService), 'set');
      const seo = vi.spyOn(TestBed.inject(SeoService), 'update');
      await render('artists', { artistSlug: 'nobody' });
      expect(status).toHaveBeenCalledWith(404);
      expect(seo).toHaveBeenCalledWith({ title: 'Not Found', noindex: true, structuredData: null });
      expect(lastSearch().artistSlug).toBeUndefined();
    });

    it('lists the library when the artist cannot be looked up', async () => {
      api.scoreAuthorBrowseGet.mockReturnValue(throwError(() => new Error('down')));
      await render('artists', { artistSlug: 'satie-erik' });
      expect(component.selectedAuthor).toBeNull();
      expect(lastSearch().artistSlug).toBeUndefined();
    });

    it('clearing the artist goes back to the artists tab', async () => {
      api.scoreAuthorBrowseGet.mockReturnValue(of([SATIE]));
      await render('artists', { artistSlug: 'satie-erik' });
      (el.querySelector('button[title="Clear filter"]') as HTMLButtonElement).click();
      expect(navigate).toHaveBeenCalledWith(['/library/artists']);
      expect(component.selectedAuthor).toBeNull();
      expect(lastSearch().artistSlug).toBeUndefined();
    });
  });

  describe('a genre page (/library/genres/:genreSlug)', () => {
    it('looks the genre up, then lists its scores, the name capitalized', async () => {
      await render('genres', { genreSlug: 'baroque' });
      expect(api.scoreGenreBrowseGet.mock.calls.find((c) => c[2] === 'baroque')).toBeTruthy();
      expect(lastSearch().genreSlug).toBe('baroque');
      expect(el.textContent).toContain('Baroque');
      expect(el.textContent).toContain('(3 scores)');
    });

    it('names a genre without a name', async () => {
      api.scoreGenreBrowseGet.mockReturnValue(of([{ genre: { id: 'NONE' }, count: 1 } as ScoreGenreBrowseGet200ResponseInner]));
      await render('genres', { genreSlug: 'none' });
      expect(el.textContent).toContain('genre not specified');
      expect(el.textContent).toContain('(1 score)');
    });

    it('answers 404 for an unknown genre, and lists the library when it cannot be looked up', async () => {
      api.scoreGenreBrowseGet.mockReturnValue(of([]));
      const status = vi.spyOn(TestBed.inject(ResponseStatusService), 'set');
      await render('genres', { genreSlug: 'nothing' });
      expect(status).toHaveBeenCalledWith(404);
      expect(lastSearch().genreSlug).toBeUndefined();

      fixture.destroy();
      api.scoreGenreBrowseGet.mockReturnValue(throwError(() => new Error('down')));
      await render('genres', { genreSlug: 'baroque' });
      expect(component.selectedGenre).toBeNull();
    });

    it('clearing the genre goes back to the genres tab', async () => {
      await render('genres', { genreSlug: 'baroque' });
      component.clearGenreFilter();
      expect(navigate).toHaveBeenCalledWith(['/library/genres']);
      expect(component.selectedGenre).toBeNull();
    });
  });

  describe('tabs', () => {
    it('clicking an artist opens their page with the current filters', async () => {
      await render('artists');
      component.filterTwoHands = true;
      const tile = [...el.querySelectorAll('app-browse-by-authors button.capsule')].find((b) => b.textContent?.includes('Erik Satie')) as HTMLButtonElement;
      tile.click();
      expect(navigate).toHaveBeenCalledWith(['/library/artists', 'satie-erik'], {
        queryParams: { oneHand: null, twoHands: true, fullKey: null, gradeStart: null, gradeEnd: null },
      });
      expect(lastSearch()).toMatchObject({ artistSlug: 'satie-erik', tracks: [2] });
    });

    it('clicking a genre opens its page', async () => {
      await render('genres');
      (el.querySelector('app-browse-by-genre button.capsule') as HTMLButtonElement).click();
      expect(navigate).toHaveBeenCalledWith(['/library/genres', 'baroque'], expect.anything());
      expect(lastSearch().genreSlug).toBe('baroque');
    });

    it('switches tabs keeping the query params', async () => {
      await render('genres');
      button('Popular').click();
      expect(navigate).toHaveBeenCalledWith(['/library/popular'], { queryParamsHandling: 'preserve' });
      expect(component.activeTab).toBe('popular');
    });
  });

  describe('paging', () => {
    it('Load More fetches the next page while a full page came back', async () => {
      api.scoreSearchGet.mockReturnValueOnce(of(page(1, 100))).mockReturnValueOnce(of(page(101, 5)));
      await render('popular');
      expect(component.hasMore).toBe(true);
      button('Load More').click();
      expect(lastSearch().offset).toBe(100);
      expect(component.scores).toHaveLength(105);
      expect(component.hasMore).toBe(false);
    });

    it('pages an artist and a genre too, and not past the last page', async () => {
      api.scoreAuthorBrowseGet.mockReturnValue(of([SATIE]));
      api.scoreSearchGet.mockReturnValueOnce(of(page(1, 100))).mockReturnValueOnce(of(page(101, 1)));
      await render('artists', { artistSlug: 'satie-erik' });
      component.loadMore();
      expect(lastSearch()).toMatchObject({ artistSlug: 'satie-erik', offset: 100 });
      const calls = api.scoreSearchGet.mock.calls.length;
      component.loadMore(); // last page reached
      expect(api.scoreSearchGet.mock.calls.length).toBe(calls);

      component.selectedAuthor = null;
      component.selectedGenre = BAROQUE;
      component.hasMore = true;
      component.loadMore();
      expect(lastSearch().genreSlug).toBe('baroque');
    });
  });

  describe('opening a score', () => {
    it('opens it, in a new tab when asked, and ignores a score without slug', async () => {
      await render('popular');
      const open = vi.spyOn(window, 'open').mockReturnValue(null);
      component.onScoreClick({ score: score(1), openInNewTab: false } as never);
      expect(navigate).toHaveBeenCalledWith(['/score', 'score-1']);
      component.onScoreClick({ score: score(2), openInNewTab: true } as never);
      expect(open).toHaveBeenCalledWith('/score/score-2', '_blank', 'noopener');
      navigate.mockClear();
      component.onScoreClick({ score: score(3, { immutableSlug: undefined }), openInNewTab: false } as never);
      expect(navigate).not.toHaveBeenCalled();
    });

    it('opens the info page by immutable or mutable slug', async () => {
      await render('popular');
      component.onScoreInfo(score(1));
      expect(navigate).toHaveBeenCalledWith(['/score', 'score-1']);
      component.onScoreInfo(score(2, { immutableSlug: undefined, mutableSlug: 'mutable-2' }));
      expect(navigate).toHaveBeenCalledWith(['/score', 'mutable-2']);
      component.onScoreInfo(score(3, { immutableSlug: undefined, mutableSlug: undefined }));
      expect(console.error).toHaveBeenCalledWith('Score slug is missing');
    });
  });

  describe('filters', () => {
    it('applying filters keeps the artist, the genre, or the tab', async () => {
      api.scoreAuthorBrowseGet.mockReturnValue(of([SATIE]));
      await render('artists', { artistSlug: 'satie-erik' });
      component.selectedFullKey = 'C major';
      component.applyFilters();
      expect(navigate).toHaveBeenCalledWith(['/library/artists', 'satie-erik'], expect.objectContaining({ queryParams: expect.objectContaining({ fullKey: 'C major' }) }));

      component.selectedAuthor = null;
      component.selectedGenre = BAROQUE;
      component.applyFilters();
      expect(navigate).toHaveBeenCalledWith(['/library/genres', 'baroque'], expect.anything());

      component.selectedGenre = null;
      component.activeTab = 'popular';
      component.applyFilters();
      expect(navigate).toHaveBeenCalledWith(['/library/'], expect.objectContaining({ queryParamsHandling: 'merge' }));
      component.activeTab = 'new';
      component.applyFilters();
      expect(navigate).toHaveBeenCalledWith(['/library/new'], expect.anything());
    });

    it('the hands checkboxes filter by track count', async () => {
      await render('popular');
      const [oneHand] = [...el.querySelectorAll('#browse-handedness input')] as HTMLInputElement[];
      oneHand.click();
      fixture.detectChanges();
      expect(lastSearch().tracks).toEqual([1]);
    });

    it('the grade slider shows grades 1 to 8, and moving a handle filters', async () => {
      await render('popular');
      const handles = el.querySelectorAll('#browse-grade-range .noUi-handle');
      expect([...handles].map((h) => h.getAttribute('aria-label'))).toEqual(['Minimum grade', 'Maximum grade']);
      expect(el.querySelectorAll('#browse-grade-range .noUi-value')).toHaveLength(8);

      handles[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
      expect(component.selectedGradeStart).toBe(2);
      expect(lastSearch()).toMatchObject({ gradeStart: '2', gradeEnd: '8' });

      component.clearGradeFilter();
      expect([component.selectedGradeStart, component.selectedGradeEnd]).toEqual([1, 8]);
      expect(component.gradeFilterPristine).toBe(true);
      expect(lastSearch().gradeStart).toBeUndefined();
    });

    it('reloads the keys, dropping a selected key that no longer exists', async () => {
      await render('popular');
      component.selectedFullKey = 'F# major';
      component.loadFullKeys();
      expect(component.selectedFullKey).toBe('');
      api.scoreGetFullKeyGet.mockReturnValue(throwError(() => new Error('down')));
      component.loadFullKeys();
      expect(component.loadingFullKeys).toBe(false);
    });

    it('reloads the stats', async () => {
      await render('popular');
      api.scoreStatsGet.mockReturnValue(of({ 'public-domain': 1, copyrighted: 1 }));
      component.loadStats();
      expect(component.stats).toEqual({ 'public-domain': 1, copyrighted: 1 });
      api.scoreStatsGet.mockReturnValue(throwError(() => new Error('down')));
      component.loadStats();
      expect(component.loadingStats).toBe(false);
    });
  });

  describe('the guided tour', () => {
    it('Help starts it', async () => {
      await render('popular');
      const start = vi.spyOn(TestBed.inject(BeaconService), 'start').mockImplementation(() => undefined);
      button('Help').click();
      expect(start).toHaveBeenCalled();
    });

    it('starts by itself on a first visit, once its targets are on the page', async () => {
      localStorage.removeItem('browse-tour-seen');
      const start = vi.spyOn(TestBed.inject(BeaconService), 'start').mockImplementation(() => undefined);
      await render('popular');
      await new Promise((resolve) => setTimeout(resolve, 600));
      expect(start).toHaveBeenCalled();
    });
  });

  it('frees the grade slider when destroyed', async () => {
    await render('popular');
    const host = el.querySelector('#browse-grade-range') as HTMLElement & { noUiSlider?: unknown };
    expect(host.noUiSlider).toBeTruthy();
    fixture.destroy();
    expect(host.noUiSlider).toBeUndefined();
  });
});
