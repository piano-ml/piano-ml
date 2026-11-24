import { PlaylistStore } from '../../../account/services/playlist-store.service';
import { Component, EventEmitter, Input, Output, signal } from '@angular/core';
import { HttpErrorResponse, HttpHeaders, HttpResponse } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { YouTubePlayerModule } from '@angular/youtube-player';
import { Observable, Subject, of, throwError } from 'rxjs';
import { AuthService } from '../../../account/services/auth.service';
import { GenreService, ScoreApiInfo, ScoreService, WorkloadApiInfo, WorkloadService, YoutubeVideoApiInfo } from '../../../core/api';
import { ResponseStatusService, SeoService } from '../../../shared/seo';
import { provideTesting } from '../../../testing/test-providers';
import { VideoCarouselComponent } from './components/video-carousel/video-carousel.component';
import { VideoPlayerModalComponent } from './components/video-player-modal/video-player-modal.component';
import { ScoreInfoComponent } from './score-info.component';
import { setCurrentLocale } from '../../../shared/i18n';

/** Stands in for <youtube-player>, which would load YouTube's iframe API from the network. */
@Component({ selector: 'youtube-player', template: '' })
class FakeYoutubePlayerComponent {
  @Input() videoId?: string;
  @Input() width?: number;
  @Input() height?: number;
  @Output() stateChange = new EventEmitter<{ data: number }>();
}

/** A score page (/score/:slug): metadata, downloads, sharing, import status and video lessons. */
describe('ScoreInfoComponent', () => {
  let fixture: ComponentFixture<ScoreInfoComponent>;
  let component: ScoreInfoComponent;
  let el: HTMLElement;
  let navigate: ReturnType<typeof vi.fn>;
  let slug: string | null;
  let user: { id: string | null; admin: boolean };
  let scores: {
    scoreGetBySlug: ReturnType<typeof vi.fn>;
    scoreIdVideoGet: ReturnType<typeof vi.fn>;
    scoreOwnerIdTypeVersionRevisionGet: ReturnType<typeof vi.fn>;
    scoreYoutubeEdit: ReturnType<typeof vi.fn>;
  };
  let genres: { genreGet: ReturnType<typeof vi.fn> };
  let workloads: { workloadIdGet: ReturnType<typeof vi.fn> };
  /** The heart's state (FavoriteButtonComponent has its own spec) */
  const favorites = { loggedIn: signal(false), isFavorite: () => false, toggleFavorite: vi.fn() };

  const SCORE: ScoreApiInfo = {
    id: 'sc1', title: 'Gymnopédie No. 1', author: 'Erik Satie', author_slug: 'satie-erik', genre: 'classical', genre_slug: 'classical',
    genre_id: 'g1', owner_id: 'owner-1', version: 1, has_files: true, publicDomain: true, immutableSlug: 'satie-gymnopedie-1',
    fullKey: 'D major', duration: 185, tempo: 72, grade: 2,
  } as ScoreApiInfo;
  const VIDEOS: YoutubeVideoApiInfo[] = [
    { videoId: 'v1', title: 'Gymnopédie lesson', channelTitle: 'Piano Channel', publishedAt: '2024-05-01T00:00:00Z', description: 'Slow and painful' },
    { videoId: 'v2', title: 'Second take' },
    { title: 'No id: dropped' },
  ] as YoutubeVideoApiInfo[];

  /** A download answer of the API: the file and, when the browser can read it, the server-chosen name. */
  const fileResponse = (type = 'application/octet-stream', disposition?: string) =>
    new HttpResponse<Blob>({ body: new Blob(['file'], { type }), headers: disposition ? new HttpHeaders({ 'Content-Disposition': disposition }) : new HttpHeaders() });
  const settle = () => new Promise((resolve) => setTimeout(resolve));
  async function render(score: Partial<ScoreApiInfo> | null = {}) {
    if (score) scores.scoreGetBySlug.mockReturnValue(of({ ...SCORE, ...score }));
    fixture = TestBed.createComponent(ScoreInfoComponent);
    component = fixture.componentInstance;
    el = fixture.nativeElement;
    fixture.detectChanges();
    await settle();
    fixture.detectChanges();
  }
  const button = (text: string) => [...el.querySelectorAll('button')].find((b) => b.textContent?.replace(/\s+/g, ' ').trim() === text) as HTMLButtonElement;

  beforeEach(() => {
    slug = 'satie-gymnopedie-1';
    user = { id: null, admin: false };
    favorites.loggedIn.set(false);
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    scores = {
      scoreGetBySlug: vi.fn((): Observable<ScoreApiInfo> => of(SCORE)),
      scoreIdVideoGet: vi.fn((): Observable<YoutubeVideoApiInfo[]> => of(VIDEOS)),
      scoreOwnerIdTypeVersionRevisionGet: vi.fn((): Observable<HttpResponse<Blob>> => of(fileResponse())),
      scoreYoutubeEdit: vi.fn(() => of({})),
    };
    genres = { genreGet: vi.fn(() => of([{ id: 'g1', name: 'Classical' }, { id: 'g2', name: 'Jazz' }])) };
    workloads = { workloadIdGet: vi.fn((): Observable<WorkloadApiInfo> => of({ status: 'FAILED', kind: 'OMR_PDF', duration: 1234, errorMessage: 'homr crashed' } as WorkloadApiInfo)) };
    TestBed.configureTestingModule({
      imports: [ScoreInfoComponent],
      providers: [
        ...provideTesting(),
        { provide: ScoreService, useValue: scores },
        { provide: GenreService, useValue: genres },
        { provide: WorkloadService, useValue: workloads },
        { provide: AuthService, useValue: { getUserId: () => user.id, isAdmin: () => user.admin } },
        { provide: PlaylistStore, useValue: favorites },
        { provide: ActivatedRoute, useValue: { snapshot: { get paramMap() { return convertToParamMap(slug ? { slug } : {}); } } } },
      ],
    });
    TestBed.overrideComponent(VideoPlayerModalComponent, {
      remove: { imports: [YouTubePlayerModule] },
      add: { imports: [FakeYoutubePlayerComponent] },
    });
    navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true) as unknown as ReturnType<typeof vi.fn>;
  });

  afterEach(() => fixture?.destroy());

  describe('loading the score', () => {
    it('shows its title, artist and details, with the genre name in the SEO data', async () => {
      const seo = vi.spyOn(TestBed.inject(SeoService), 'update');
      await render();
      expect(scores.scoreGetBySlug).toHaveBeenCalledWith('satie-gymnopedie-1');
      expect(el.querySelector('.page-title')?.textContent).toBe('Gymnopédie No. 1');
      expect(el.querySelector('.page-sub-title')?.textContent).toBe('Erik Satie');
      expect(el.textContent).toContain('3:05'); // duration
      expect(component.selectedGenre?.name).toBe('Classical');
      expect(seo).toHaveBeenCalled();
      expect(workloads.workloadIdGet).not.toHaveBeenCalled(); // has files
    });

    it('answers 404 without a slug', async () => {
      slug = null;
      const status = vi.spyOn(TestBed.inject(ResponseStatusService), 'set');
      await render(null);
      expect(scores.scoreGetBySlug).not.toHaveBeenCalled();
      expect(status).toHaveBeenCalledWith(404);
      expect(el.querySelector('.alert-error')?.textContent).toContain('No score slug provided');
    });

    it('answers 404 when the API does not know the slug, and only then', async () => {
      const status = vi.spyOn(TestBed.inject(ResponseStatusService), 'set');
      scores.scoreGetBySlug.mockReturnValue(throwError(() => ({ status: 404, message: 'Not Found' })));
      await render(null);
      expect(status).toHaveBeenCalledWith(404);
      expect(el.querySelector('.alert-error')?.textContent).toContain('Not Found');

      fixture.destroy();
      status.mockClear();
      scores.scoreGetBySlug.mockReturnValue(throwError(() => ({ status: 500 })));
      await render(null);
      expect(status).not.toHaveBeenCalled();
      expect(component.error).toBe('Failed to load score');
    });

    it('still shows the score when the genres cannot be loaded', async () => {
      genres.genreGet.mockReturnValue(throwError(() => new Error('down')));
      await render();
      expect(component.selectedGenre).toBeNull();
      expect(el.querySelector('.page-title')).toBeTruthy();
    });
  });

  describe('a score still being processed (no files yet)', () => {
    it('shows the import status, without the download and practice buttons', async () => {
      await render({ has_files: false });
      expect(workloads.workloadIdGet).toHaveBeenCalledWith('sc1');
      expect(el.textContent).toContain('Processing status');
      expect(el.textContent).toContain('Failed'); // the API's FAILED, as a label (upper-cased by CSS)
      expect(el.textContent).toContain('OMR_PDF');
      expect(el.textContent).toContain('1234ms');
      expect(el.textContent).toContain('homr crashed');
      expect(button('Practice')).toBeUndefined();
      expect(button('MIDI')).toBeUndefined();
    });

    it('says when there is no status to show', async () => {
      workloads.workloadIdGet.mockReturnValue(throwError(() => new Error('404')));
      await render({ has_files: false });
      expect(el.textContent).toContain('No processing information available');
    });
  });

  describe('buttons', () => {
    it('Practice opens the workbench and Browse the library', async () => {
      await render();
      ([...el.querySelectorAll('button')].find((b) => b.textContent?.includes('Practice')) as HTMLButtonElement).click();
      expect(navigate).toHaveBeenCalledWith(['/work/satie-gymnopedie-1']);
      button('← Browse').click();
      expect(navigate).toHaveBeenCalledWith(['/library']);
    });

    it('shows the favorite button to logged-in users only', async () => {
      await render();
      expect(el.querySelector('app-favorite-button')).toBeNull();
      favorites.loggedIn.set(true);
      fixture.detectChanges();
      expect(el.querySelector('app-favorite-button')).toBeTruthy();
    });

    it('Edit shows for the owner and for admins only', async () => {
      await render();
      expect(button('Edit')).toBeUndefined();
      user = { id: 'owner-1', admin: false };
      fixture.detectChanges();
      button('Edit').click();
      expect(navigate).toHaveBeenCalledWith(['/account/score/edit', 'sc1']);
      user = { id: 'someone-else', admin: true };
      fixture.detectChanges();
      expect(button('Edit')).toBeTruthy();
    });

    it('Re-import shows for the owner and for admins of a converted score, and opens its re-import page', async () => {
      await render();
      expect(button('Re-import')).toBeUndefined();
      user = { id: 'owner-1', admin: false };
      fixture.detectChanges();
      button('Re-import').click();
      expect(navigate).toHaveBeenCalledWith(['/score', 'satie-gymnopedie-1', 'reimport']);
      user = { id: 'someone-else', admin: true };
      fixture.detectChanges();
      expect(button('Re-import')).toBeTruthy();

      fixture.destroy();
      await render({ has_files: false }); // nothing converted yet: nothing to re-import
      expect(button('Re-import')).toBeUndefined();
    });
  });

  describe('downloads', () => {
    let downloaded: string[];
    const buttonsOrder = () => [...el.querySelectorAll('button')].map((b) => b.textContent?.replace(/\s+/g, ' ').trim());

    beforeEach(() => {
      downloaded = [];
      vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) { downloaded.push(this.download); });
      vi.spyOn(window.URL, 'createObjectURL').mockReturnValue('blob:fake');
      vi.spyOn(window.URL, 'revokeObjectURL').mockImplementation(() => undefined);
    });

    it('saves each file as an attachment named after the slug, PDF included (never opened inline)', async () => {
      await render();
      const href = window.location.href;
      button('MIDI').click();
      button('MusicXML').click();
      button('PDF').click();
      expect(scores.scoreOwnerIdTypeVersionRevisionGet).toHaveBeenCalledWith('owner-1', 'sc1', 'midi', 1, 1, 'response');
      expect(downloaded).toEqual(['satie-gymnopedie-1.mid', 'satie-gymnopedie-1.musicxml', 'satie-gymnopedie-1.pdf']);
      expect(window.location.href).toBe(href);
    });

    it('uses the file name the API chose when the browser can read it', async () => {
      await render();
      scores.scoreOwnerIdTypeVersionRevisionGet.mockReturnValue(of(fileResponse('application/pdf',
        `attachment; filename="=?UTF-8?Q?x?="; filename*=UTF-8''satie-gymnopedie-1.pdf`)));
      button('PDF').click();
      expect(downloaded).toEqual(['satie-gymnopedie-1.pdf']);
    });

    it('falls back to the score id for a score without slug', async () => {
      await render({ immutableSlug: undefined });
      button('MIDI').click();
      expect(downloaded).toEqual(['sc1.mid']);
    });

    it('frees the object URL after the browser took the file', async () => {
      await render();
      vi.useFakeTimers();
      try {
        component.download('midi');
        expect(window.URL.revokeObjectURL).not.toHaveBeenCalled();
        vi.advanceTimersByTime(1000);
        expect(window.URL.revokeObjectURL).toHaveBeenCalledWith('blob:fake');
      } finally {
        vi.useRealTimers();
      }
    });

    it('refuses copyrighted scores to everyone but their owner', async () => {
      await render({ publicDomain: false });
      expect(button('MIDI').disabled).toBe(true);
      expect(button('MIDI').title).toBe('Downloads restricted — copyrighted work');
      component.download('midi');
      expect(scores.scoreOwnerIdTypeVersionRevisionGet).not.toHaveBeenCalled();

      user = { id: 'owner-1', admin: false };
      fixture.detectChanges();
      expect(button('MIDI').disabled).toBe(false);
      expect(button('MIDI').title).toBe('Download MIDI');
    });

    it('runs one download at a time, with a spinner on its button', async () => {
      await render();
      const pending = new Subject<HttpResponse<Blob>>();
      scores.scoreOwnerIdTypeVersionRevisionGet.mockReturnValue(pending);
      button('PDF').click();
      fixture.detectChanges();
      expect(button('PDF').getAttribute('aria-busy')).toBe('true');
      expect(button('PDF').querySelector('.spinner')).toBeTruthy();
      expect(button('MIDI').disabled).toBe(true);
      component.download('midi');
      expect(scores.scoreOwnerIdTypeVersionRevisionGet).toHaveBeenCalledTimes(1);

      pending.next(fileResponse('application/pdf'));
      pending.complete();
      fixture.detectChanges();
      expect(component.downloading).toBeNull();
      expect(button('MIDI').disabled).toBe(false);
      expect(downloaded).toEqual(['satie-gymnopedie-1.pdf']);
    });

    it('explains a failed download next to the buttons, keeps the score visible, and clears it on retry or dismiss', async () => {
      await render();
      scores.scoreOwnerIdTypeVersionRevisionGet.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 404 })));
      button('MusicXML').click();
      fixture.detectChanges();
      const alert = el.querySelector('[role="alert"]');
      expect(alert?.textContent).toContain('The MusicXML is not available for this score.');
      expect(component.error).toBeNull();
      expect(el.textContent).toContain('Gymnopédie No. 1');
      expect(component.downloading).toBeNull();

      scores.scoreOwnerIdTypeVersionRevisionGet.mockReturnValue(of(fileResponse()));
      button('MIDI').click();
      fixture.detectChanges();
      expect(el.querySelector('[role="alert"]')).toBeNull();

      component.downloadError = 'boom';
      fixture.detectChanges();
      (el.querySelector('[aria-label="Dismiss download error"]') as HTMLButtonElement).click();
      fixture.detectChanges();
      expect(el.querySelector('[role="alert"]')).toBeNull();
    });

    it('reports an empty answer and a score missing what a download needs', async () => {
      await render();
      scores.scoreOwnerIdTypeVersionRevisionGet.mockReturnValue(of(new HttpResponse<Blob>({ body: null })));
      component.download('pdf');
      expect(component.downloadError).toBe('Could not download the PDF. Please try again later.');
      expect(downloaded).toEqual([]);

      component.score = { ...SCORE, version: undefined } as ScoreApiInfo;
      component.download('midi');
      expect(component.downloadError).toBe('Could not download the MIDI: this score is missing information.');
    });

    describe('the original upload', () => {
      it('shows only to the owner and admins, between Browse and MIDI', async () => {
        await render();
        expect(button('Original')).toBeUndefined();

        user = { id: 'owner-1', admin: false };
        fixture.detectChanges();
        const order = buttonsOrder();
        expect(order[0]).toBe('← Browse'); // first, at the left
        expect(order.indexOf('Original')).toBeGreaterThan(order.indexOf('← Browse'));
        expect(order.indexOf('Original')).toBeLessThan(order.indexOf('MIDI'));

        user = { id: 'someone-else', admin: true };
        fixture.detectChanges();
        expect(button('Original')).toBeTruthy();

        user = { id: 'someone-else', admin: false };
        fixture.detectChanges();
        expect(button('Original')).toBeUndefined();
      });

      it('stays available to the owner while the import is still processing', async () => {
        user = { id: 'owner-1', admin: false };
        await render({ has_files: false });
        expect(button('MIDI')).toBeUndefined();
        expect(button('Original')).toBeTruthy();
      });

      it('downloads it named from the slug and the served content type, even for a copyrighted work', async () => {
        user = { id: 'owner-1', admin: false };
        await render({ publicDomain: false });
        scores.scoreOwnerIdTypeVersionRevisionGet.mockReturnValue(of(fileResponse('application/pdf')));
        button('Original').click();
        expect(scores.scoreOwnerIdTypeVersionRevisionGet).toHaveBeenCalledWith('owner-1', 'sc1', 'original', 1, 1, 'response');
        expect(downloaded).toEqual(['satie-gymnopedie-1-original.pdf']);
      });

      it('is not requested for other users, and explains a refusal', async () => {
        await render();
        component.download('original');
        expect(scores.scoreOwnerIdTypeVersionRevisionGet).not.toHaveBeenCalled();

        user = { id: 'owner-1', admin: false };
        scores.scoreOwnerIdTypeVersionRevisionGet.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 403 })));
        component.download('original');
        expect(component.downloadError).toBe('You are not allowed to download the original file of this score.');
      });
    });
  });

  describe('Copy link', () => {
    it('copies the public URL of the score', async () => {
      await render();
      const write = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined);
      button('Copy link').click();
      expect(write).toHaveBeenCalledWith(`${location.protocol}//${location.host}/score/satie-gymnopedie-1`);
    });

    it("shares the score in the page's language", async () => {
      setCurrentLocale('es');
      try {
        await render();
        const write = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined);
        button('Copy link').click();
        expect(write).toHaveBeenCalledWith(`${location.protocol}//${location.host}/es/score/satie-gymnopedie-1`);
      } finally {
        setCurrentLocale(undefined);
      }
    });

    it('falls back to a hidden text area when the clipboard API refuses or is missing', async () => {
      await render();
      const exec = vi.spyOn(document, 'execCommand').mockReturnValue(true);
      vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValue(new Error('denied'));
      component.copyUrlToClipboard();
      await settle();
      expect(exec).toHaveBeenCalledWith('copy');

      exec.mockClear();
      const clipboard = Object.getOwnPropertyDescriptor(Navigator.prototype, 'clipboard');
      Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true });
      try {
        component.copyUrlToClipboard();
        expect(exec).toHaveBeenCalledWith('copy');
      } finally {
        delete (navigator as unknown as Record<string, unknown>)['clipboard'];
        if (clipboard) expect(navigator.clipboard).toBeTruthy();
      }
    });

    it('has nothing to copy without a slug', async () => {
      await render({ immutableSlug: undefined });
      const write = vi.spyOn(navigator.clipboard, 'writeText');
      component.copyUrlToClipboard();
      expect(component.getPublicUrl()).toBeNull();
      expect(write).not.toHaveBeenCalled();
    });
  });

  describe('video lessons', () => {
    it('lists the videos that have an id', async () => {
      await render();
      const cards = el.querySelectorAll('app-video-carousel-item');
      expect(cards).toHaveLength(2);
      expect(cards[0].textContent).toContain('Gymnopédie lesson');
      expect(cards[0].textContent).toContain('Piano Channel');
      expect(cards[1].textContent).toContain('Second take');
    });

    it('shows no videos and no error when they cannot be loaded', async () => {
      scores.scoreIdVideoGet.mockReturnValue(throwError(() => ({ status: 502, message: 'Http failure response: 502 Bad Gateway' })));
      await render();
      expect(el.textContent).not.toContain('502');
      expect(el.querySelector('.video-lessons-section .alert-error')).toBeNull();
      expect(el.querySelector('app-video-carousel')).toBeNull();
      expect(el.querySelector('.video-lessons-section [role="status"]')).toBeNull(); // not loading forever either
    });

    it('does not ask for videos of a score without id', async () => {
      await render({ id: undefined });
      expect(scores.scoreIdVideoGet).not.toHaveBeenCalled();
      expect(component.videos).toEqual([]);
    });

    it('plays a video in a dialog, counts the view once, takes votes, and closes', async () => {
      await render();
      (el.querySelector('app-video-carousel-item button') as HTMLButtonElement).click();
      fixture.detectChanges();
      const dialog = el.querySelector('[role="dialog"]') as HTMLElement;
      expect(dialog.querySelector('.video-panel-title')?.textContent).toBe('Gymnopédie lesson');
      expect(dialog.textContent).toContain('Slow and painful');

      const player = fixture.debugElement.query((d) => d.componentInstance instanceof FakeYoutubePlayerComponent).componentInstance as FakeYoutubePlayerComponent;
      expect(player.videoId).toBe('v1');
      player.stateChange.emit({ data: 1 }); // playing
      player.stateChange.emit({ data: 1 }); // still playing: not another view
      expect(scores.scoreYoutubeEdit).toHaveBeenCalledTimes(1);
      expect(scores.scoreYoutubeEdit).toHaveBeenCalledWith('sc1', 'v1', 'view');

      (dialog.querySelector('[aria-label="Upvote video"]') as HTMLButtonElement).click();
      expect(scores.scoreYoutubeEdit).toHaveBeenLastCalledWith('sc1', 'v1', 'upvote');
      scores.scoreYoutubeEdit.mockReturnValue(throwError(() => new Error('500')));
      (dialog.querySelector('[aria-label="Report video"]') as HTMLButtonElement).click();
      expect(console.error).toHaveBeenCalledWith('Error during video action report:', expect.any(Error));

      (dialog.querySelector('[aria-label="Close video"]') as HTMLButtonElement).click();
      fixture.detectChanges();
      expect(el.querySelector('[role="dialog"]')).toBeNull();
      expect(component.selectedVideo).toBeNull();
    });

    it('closes the dialog with Escape or a click outside it, and ignores a video without id', async () => {
      await render();
      component.openVideoPlayer(VIDEOS[2]);
      expect(component.isVideoPlayerOpen).toBe(false);

      component.openVideoPlayer(VIDEOS[1]);
      fixture.detectChanges();
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      fixture.detectChanges();
      expect(component.isVideoPlayerOpen).toBe(false);

      component.openVideoPlayer(VIDEOS[1]);
      fixture.detectChanges();
      (el.querySelector('[role="dialog"]') as HTMLElement).click();
      fixture.detectChanges();
      expect(component.isVideoPlayerOpen).toBe(false);
    });

    it('scrolls the carousel by about a screen', async () => {
      scores.scoreIdVideoGet.mockReturnValue(of(Array.from({ length: 12 }, (_, i) => ({ videoId: `v${i}`, title: `Video ${i}` }))));
      await render();
      const carousel = fixture.debugElement.query((d) => d.componentInstance instanceof VideoCarouselComponent).componentInstance as VideoCarouselComponent;
      const track = el.querySelector('.carousel-track') as HTMLElement;
      const scrollBy = vi.spyOn(track, 'scrollBy').mockImplementation(() => undefined);
      carousel.scrollRight();
      carousel.scrollLeft();
      expect(scrollBy.mock.calls.map(([options]) => Math.sign((options as ScrollToOptions).left ?? 0))).toEqual([1, -1]);
      track.dispatchEvent(new Event('scroll'));
      expect(carousel.canScrollLeft).toBe(track.scrollLeft > 8);
    });
  });
});
