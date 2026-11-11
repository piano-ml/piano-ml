import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { BehaviorSubject, NEVER, of, throwError } from 'rxjs';
import { AuthService } from '../../../account/services/auth.service';
import { type MusicBrainzWork, MusicbrainzService } from '../../../shared/services/musicbrainz.service';
import { provideTesting } from '../../../testing/test-providers';
import { LinkComponent } from './link.component';

/** First step of an import: find the work on MusicBrainz, or create it from an artist and a title. */
describe('LinkComponent', () => {
  let fixture: ComponentFixture<LinkComponent>;
  let component: LinkComponent;
  let el: HTMLElement;
  let loggedIn: BehaviorSubject<boolean>;
  let musicbrainz: MusicbrainzService;
  let navigate: ReturnType<typeof vi.spyOn>;

  const work = (id: string, title: string, relations: unknown[]) => ({ id, title, relations }) as unknown as MusicBrainzWork;
  const artist = (id: string, name: string) => ({ id, name });
  const REDEMPTION = work('w1', 'Redemption Song', [{ type: 'composer', artist: artist('a1', 'Bob Marley') }]);

  async function render() {
    fixture = TestBed.createComponent(LinkComponent);
    component = fixture.componentInstance;
    el = fixture.nativeElement;
    fixture.detectChanges();
    await fixture.whenStable();
  }
  async function typeAndEnter(placeholderStart: string, value: string) {
    const input = el.querySelector(`input[placeholder^="${placeholderStart}"]`) as HTMLInputElement;
    input.value = value;
    input.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    input.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter' }));
    fixture.detectChanges();
  }
  const button = (text: string) => [...el.querySelectorAll('button')].find((b) => b.textContent?.trim().startsWith(text)) as HTMLButtonElement;
  const click = (text: string) => { button(text).click(); fixture.detectChanges(); };

  beforeEach(async () => {
    loggedIn = new BehaviorSubject(true);
    await TestBed.configureTestingModule({
      imports: [LinkComponent],
      providers: [...provideTesting(), { provide: AuthService, useValue: { isLoggedIn: loggedIn } }],
    }).compileComponents();
    musicbrainz = TestBed.inject(MusicbrainzService);
    navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
  });

  describe('when logged out', () => {
    it('asks to log in, coming back here afterwards', async () => {
      loggedIn.next(false);
      await render();
      expect(el.textContent).toContain('Authentication Required');
      expect(el.querySelector('input')).toBeNull();
      expect(el.querySelector('a[href^="/account/login"]')).not.toBeNull();
    });

    it('shows the search as soon as the user logs in', async () => {
      loggedIn.next(false);
      await render();
      loggedIn.next(true);
      fixture.detectChanges();
      expect(el.querySelector('input[placeholder^="Search for works"]')).not.toBeNull();
    });
  });

  describe('searching works', () => {
    it('focuses the search box', async () => {
      await render();
      await new Promise((resolve) => setTimeout(resolve));
      expect(document.activeElement).toBe(el.querySelector('input[placeholder^="Search for works"]'));
    });

    it('lists the works found with their composer', async () => {
      const search = vi.spyOn(musicbrainz, 'searchWorks').mockReturnValue(of({ count: 1, works: [REDEMPTION] }) as never);
      await render();
      await typeAndEnter('Search for works', 'redemption song');
      expect(search).toHaveBeenCalledWith({ query: 'redemption song', limit: 50 });
      expect(el.textContent).toContain('1 works found');
      const row = el.querySelector('tbody tr')!;
      expect(row.textContent).toContain('Redemption Song');
      expect(row.textContent).toContain('Bob Marley');
    });

    it('credits the composer even when another artist is listed first', async () => {
      await render();
      const credited = component.fromMusicBrainzWorkToSimplified(work('w2', 'Imagine', [
        { type: 'lyricist', artist: artist('a2', 'Yoko Ono') },
        { type: 'composer', artist: artist('a3', 'John Lennon') },
      ]));
      expect(credited).toEqual({ mbid: 'w2', title: 'Imagine', artistMbId: 'a3', artistName: 'John Lennon' });
    });

    it('falls back to any related artist, and skips works without one', async () => {
      vi.spyOn(musicbrainz, 'searchWorks').mockReturnValue(of({
        count: 2,
        works: [work('w3', 'Traditional', []), work('w4', 'Song', [{ type: 'performer', artist: artist('a4', 'Singer') }])],
      }) as never);
      await render();
      await typeAndEnter('Search for works', 'song');
      const rows = [...el.querySelectorAll('tbody tr')];
      expect(rows.map((r) => [...r.querySelectorAll('td')].slice(0, 2).map((td) => td.textContent?.trim()))).toEqual([['Song', 'Singer']]);
    });

    it('opens the upload step for the chosen work, without changing the URL', async () => {
      vi.spyOn(musicbrainz, 'searchWorks').mockReturnValue(of({ count: 1, works: [REDEMPTION] }) as never);
      await render();
      await typeAndEnter('Search for works', 'redemption');
      click('Select');
      expect(navigate).toHaveBeenCalledWith(['/import/import-work', 'w1'], {
        state: { work: { mbid: 'w1', title: 'Redemption Song', artistMbId: 'a1', artistName: 'Bob Marley' } },
        skipLocationChange: true,
      });
    });

    it('says when nothing was found, or nothing usable', async () => {
      const search = vi.spyOn(musicbrainz, 'searchWorks').mockReturnValue(of({ count: 0, works: [] }) as never);
      await render();
      await typeAndEnter('Search for works', 'zzzz');
      expect(el.textContent).toContain('No works found matching your criteria.');
      search.mockReturnValue(of({ count: 1, works: [work('w5', 'Orphan', [])] }) as never);
      await typeAndEnter('Search for works', 'orphan');
      expect(el.textContent).toContain('found 1 but none matched');
    });

    it('shows progress while searching', async () => {
      vi.spyOn(musicbrainz, 'searchWorks').mockReturnValue(NEVER as never);
      await render();
      await typeAndEnter('Search for works', 'slow');
      expect(el.textContent).toContain('Searching MusicBrainz database...');
      expect(button('Search').disabled).toBe(true);
    });

    it('shows an error that can be dismissed', async () => {
      vi.spyOn(musicbrainz, 'searchWorks').mockReturnValue(throwError(() => new Error('503 Service Unavailable')) as never);
      await render();
      await typeAndEnter('Search for works', 'x');
      expect(el.textContent).toContain('Error occurred');
      expect(el.textContent).toContain('503 Service Unavailable');
      click('Dismiss');
      expect(el.textContent).not.toContain('Error occurred');
    });

    it('does not search an empty query, and Clear resets everything', async () => {
      const search = vi.spyOn(musicbrainz, 'searchWorks').mockReturnValue(of({ count: 1, works: [REDEMPTION] }) as never);
      await render();
      await typeAndEnter('Search for works', '   ');
      expect(search).not.toHaveBeenCalled();
      await typeAndEnter('Search for works', 'redemption');
      click('Clear');
      expect(component.searchQuery).toBe('');
      expect(el.querySelector('tbody tr')).toBeNull();
      expect(button("Can't find")).toBeUndefined();
    });
  });

  describe('creating a work manually', () => {
    const MARLEY = { id: 'a1', name: 'Bob Marley', type: 'Person', country: 'JM', disambiguation: 'reggae singer' };

    async function startManual() {
      vi.spyOn(musicbrainz, 'searchWorks').mockReturnValue(of({ count: 0, works: [] }) as never);
      await render();
      await typeAndEnter('Search for works', 'my song');
      click("Can't find");
    }

    it('is offered once a search was made', async () => {
      await render();
      expect(button("Can't find")).toBeUndefined();
      await startManual();
      expect(el.textContent).toContain('Create Work Manually');
    });

    it('finds the artist, then takes the title, and opens the upload step', async () => {
      const search = vi.spyOn(musicbrainz, 'searchArtistsByName').mockReturnValue(of({ count: 1, artists: [MARLEY] }) as never);
      await startManual();
      await typeAndEnter('Enter artist name', 'marley');
      expect(search).toHaveBeenCalledWith('marley', 50);
      expect(el.textContent).toContain('Found 1 artists');
      expect(el.textContent).toContain('reggae singer');
      expect(el.textContent).toContain('JM');

      click('Select');
      expect(el.textContent).toContain('Selected Artist: Bob Marley');
      expect(button('Create Work').disabled).toBe(true);
      await typeAndEnter('Enter work/song title', '  One Love  ');
      expect(navigate).toHaveBeenCalledWith(['/import/import-work', 'manual'], {
        state: { work: { title: 'One Love', artistMbId: 'a1', artistName: 'Bob Marley' } },
        skipLocationChange: true,
      });
    });

    it('says when no artist matches', async () => {
      vi.spyOn(musicbrainz, 'searchArtistsByName').mockReturnValue(of({ count: 0, artists: [] }) as never);
      await startManual();
      await typeAndEnter('Enter artist name', 'nobody');
      expect(el.textContent).toContain('No artists found matching your search.');
    });

    it('shows progress and errors of the artist search', async () => {
      const search = vi.spyOn(musicbrainz, 'searchArtistsByName').mockReturnValue(NEVER as never);
      await startManual();
      await typeAndEnter('Enter artist name', 'slow');
      expect(el.textContent).toContain('Searching for artists...');
      search.mockReturnValue(throwError(() => new Error('rate limited')) as never);
      component.loading = false;
      await typeAndEnter('Enter artist name', 'again');
      expect(el.textContent).toContain('rate limited');
    });

    it('can go back to the artist search, or cancel', async () => {
      vi.spyOn(musicbrainz, 'searchArtistsByName').mockReturnValue(of({ count: 1, artists: [MARLEY] }) as never);
      await startManual();
      await typeAndEnter('Enter artist name', 'marley');
      click('Select');
      component.backToArtistSearch();
      fixture.detectChanges();
      expect(component.manualCreationStep).toBe('artist');
      expect(component.selectedArtist).toBeNull();
      component.cancelManualCreation();
      fixture.detectChanges();
      expect(el.textContent).not.toContain('Create Work Manually');
      expect(el.querySelector('input[placeholder^="Search for works"]')).not.toBeNull();
    });

    it('does nothing without an artist and a title', async () => {
      await render();
      component.submitManualWork();
      component.selectedArtist = MARLEY as never;
      component.workTitle = '   ';
      component.submitManualWork();
      component.artistSearchQuery = '  ';
      component.searchArtists();
      expect(navigate).not.toHaveBeenCalled();
    });
  });

  describe('work details helpers', () => {
    const DETAILED = work('w6', 'Yesterday', [
      { type: 'composer', artist: artist('a5', 'Paul McCartney') },
      { type: 'lyricist', artist: artist('a5', 'Paul McCartney') },
    ]);

    it('lists composers and lyricists, or N/A', async () => {
      await render();
      expect(component.getComposersList(DETAILED)).toBe('Paul McCartney');
      expect(component.getLyricistsList(DETAILED)).toBe('Paul McCartney');
      expect(component.getComposersList(work('w7', 'x', []))).toBe('N/A');
      expect(component.getLyricistsList(work('w7', 'x', []))).toBe('N/A');
      expect(component.getRecordings(work('w7', 'x', []))).toEqual([]);
    });

    it('shows the language in capitals, or N/A', async () => {
      await render();
      vi.spyOn(musicbrainz, 'getPrimaryLanguage').mockReturnValueOnce('eng').mockReturnValueOnce('unknown');
      expect(component.getPrimaryLanguage(DETAILED)).toBe('ENG');
      expect(component.getPrimaryLanguage(DETAILED)).toBe('N/A');
    });

    it('toggleSongsOnly flips the option', async () => {
      await render();
      component.toggleSongsOnly();
      expect(component.showSongsOnly).toBe(false);
    });
  });
});
