import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { HttpEventType, HttpResponse, type HttpEvent } from '@angular/common/http';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { page } from 'vitest/browser';
import { Subject, of } from 'rxjs';
import { type ScoreApiInfo, ScoreService } from '../../../core/api';
import { SeoService } from '../../../shared/seo';
import { MidiServiceService } from '../../../shared/services/midi-service.service';
import { provideHttpClient, withXhr } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { BeaconService, provideBeacon } from 'ng-beacon';
import { WORKBENCH_TOUR } from './workbench.tour';
import { provideApi } from '../../../core/api';
import { SIMPLE_SCORE, scoreMidi, scoreXml } from '../../../testing/score-fixture';
import { EXERCICE_INFO_KEY, MIDI_STORAGE_KEY, MUSIC_XML_STORAGE_KEY } from '../../model/model';
import { CursorService } from '../../service/cursor.service';
import { PlayerAudioService } from '../../service/player-audio.service';
import { PlayerService } from '../../service/player.service';
import { WorkbenchComponent } from './workbench.component';

const SCORE: ScoreApiInfo = {
  id: 's1', owner_id: 'o1', version: 1, title: 'Happy Birthday', author: 'Mildred J. Hill', tempo: 100,
  immutableSlug: 'hill-happy-birthday', study_tracks: [0, 1],
} as ScoreApiInfo;

describe('WorkbenchComponent', () => {
  let harness: RouterTestingHarness;
  let component: WorkbenchComponent;
  let scores: ScoreService;
  let audio: PlayerAudioService;
  let player: PlayerService;
  let downloads: Record<'midi' | 'musicxml', Subject<HttpEvent<Blob>>>;
  let navigate: ReturnType<typeof vi.spyOn>;

  const el = () => harness.routeNativeElement as HTMLElement;
  const render = () => harness.detectChanges();
  async function waitFor(condition: () => boolean, timeout = 8000) {
    const start = Date.now();
    while (!condition()) {
      if (Date.now() - start > timeout) throw new Error('timed out waiting');
      render();
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    render();
  }
  const response = (body: BlobPart) => new HttpResponse({ body: new Blob([body]) });
  /** Serves both score files at once. */
  function serveFiles() {
    downloads.midi.next(response(new Uint8Array(scoreMidi(SIMPLE_SCORE).toArray())));
    downloads.midi.complete();
    downloads.musicxml.next(response(scoreXml(SIMPLE_SCORE)));
    downloads.musicxml.complete();
  }
  /** Opens /work/<slug> and waits until the score is rendered and mapped. */
  async function openScore() {
    component = await harness.navigateByUrl('/work/hill-happy-birthday', WorkbenchComponent);
    serveFiles();
    await waitFor(() => component.osmdLoading === false && !!el().querySelector('.osmd-container svg'));
    return component;
  }
  const button = (selector: string) => el().querySelector(selector) as HTMLElement;
  /** Clicks the play/pause button like a user (a DOM event marks the OnPush view for update). */
  function clickPlayPause() {
    (button('#play-pause button') as HTMLButtonElement).click();
    render();
  }

  beforeEach(async () => {
    localStorage.clear();
    localStorage.setItem('workbench-tour-seen', 'true');
    const midiService = {
      midiEvent: signal(null), setupMidiDeviceListeners: vi.fn(), resetSessionOutputs: vi.fn(), pianoMLShouldPlay: vi.fn(() => true),
      pressOutput: vi.fn(), releaseOutput: vi.fn(), press: vi.fn(), release: vi.fn(), pressDrum: vi.fn(), releaseDrum: vi.fn(),
      isInputDeviceSelected: vi.fn(() => false), isOutputDeviceSelected: vi.fn(() => true),
      setInputDeviceEnabled: vi.fn(), setOutputDeviceEnabled: vi.fn(),
    };
    TestBed.configureTestingModule({
      providers: [
        // not provideTesting(): its catch-all route would swallow /work/... (routes of provideRouter calls are merged)
        provideHttpClient(withXhr()),
        provideHttpClientTesting(),
        provideApi({ basePath: '' }),
        provideBeacon(),
        provideRouter([
          { path: 'work/:slug', component: WorkbenchComponent },
          { path: 'workbench/scale/:scaleKey/:selectedKey/:exerciseKey', component: WorkbenchComponent },
          { path: '**', children: [] },
        ]),
        { provide: MidiServiceService, useValue: midiService },
      ],
    });
    scores = TestBed.inject(ScoreService);
    audio = TestBed.inject(PlayerAudioService);
    player = TestBed.inject(PlayerService);
    downloads = { midi: new Subject(), musicxml: new Subject() };
    vi.spyOn(scores, 'scoreGetBySlug').mockReturnValue(of(SCORE) as never);
    vi.spyOn(scores, 'scoreOwnerIdTypeVersionRevisionGet').mockImplementation(((_o: string, _i: string, type: 'midi' | 'musicxml') => downloads[type]) as never);
    vi.spyOn(scores, 'scorePlayStatsPost').mockReturnValue(of({}) as never);
    vi.spyOn(TestBed.inject(SeoService), 'update').mockImplementation(() => undefined);
    for (const method of ['start', 'pause', 'stop', 'clearSchedule', 'scheduleAccompanimentTracks', 'scheduleHandTrack', 'scheduleEnd'] as const) {
      vi.spyOn(audio, method).mockImplementation((() => undefined) as never);
    }
    vi.spyOn(audio, 'start').mockResolvedValue();
    vi.spyOn(audio, 'startCountIn').mockReturnValue(2);
    vi.spyOn(audio, 'initSoundFont').mockResolvedValue();
    navigate = vi.spyOn(TestBed.inject(Router), 'navigate');
    await page.viewport(1400, 900); // desktop: the toolbar stays visible while playing
    harness = await RouterTestingHarness.create();
  });

  afterEach(() => {
    vi.useRealTimers();
    localStorage.clear();
  });

  describe('opening a score (/work/:slug)', () => {
    it('loads the score by its slug, downloads its MIDI and MusicXML files, and renders it', async () => {
      await openScore();
      expect(scores.scoreGetBySlug).toHaveBeenCalledWith('hill-happy-birthday');
      for (const type of ['midi', 'musicxml']) {
        expect(scores.scoreOwnerIdTypeVersionRevisionGet).toHaveBeenCalledWith('o1', 's1', type, 1, 1, 'events', true);
      }
      expect(el().querySelector('.osmd-container svg')).not.toBeNull();
      expect(el().querySelector('app-keyboard')).not.toBeNull();
      expect(el().querySelector('.loading-feedback')).toBeNull();
    });

    it('preloads the soundfont right away', async () => {
      await openScore();
      expect(audio.initSoundFont).toHaveBeenCalled();
    });

    it('shows the title and sets the page title once rendered', async () => {
      await openScore();
      await waitFor(() => component.title !== '');
      expect(component.title).toBe('Mildred J. Hill - Happy Birthday');
      expect(TestBed.inject(SeoService).update).toHaveBeenCalledWith({ title: 'Mildred J. Hill - Happy Birthday' });
      expect(el().querySelector('.title-text')?.textContent).toContain('Mildred J. Hill - Happy Birthday');
    });

    it('uses the tempo of the score', async () => {
      await openScore();
      expect(component.tempo).toBe(100);
      expect(component.playConfiguration.tempoFactor).toBeCloseTo(100 / 120);
    });

    it('shows the real download progress of both files', async () => {
      component = await harness.navigateByUrl('/work/hill-happy-birthday', WorkbenchComponent);
      render();
      downloads.midi.next({ type: HttpEventType.DownloadProgress, loaded: 0, total: 1000 });
      downloads.musicxml.next({ type: HttpEventType.DownloadProgress, loaded: 500, total: 3000 });
      render();
      expect(component.loadingFeedBack).toEqual({ message: 'Downloading score', percentage: 13 }); // 500 / 4000
      expect(el().querySelector('.loading-feedback')?.textContent).toContain('13%');
      downloads.midi.next({ type: HttpEventType.DownloadProgress, loaded: 1000, total: 1000 });
      expect(component.loadingFeedBack?.percentage).toBe(38); // 1500 / 4000
      serveFiles();
      await waitFor(() => component.osmdLoading === false);
    });

    it('waits until both file sizes are known before showing a percentage', async () => {
      component = await harness.navigateByUrl('/work/hill-happy-birthday', WorkbenchComponent);
      downloads.midi.next({ type: HttpEventType.DownloadProgress, loaded: 1000, total: 1000 });
      expect(component.loadingFeedBack).toEqual({ message: 'Downloading score', percentage: 0 });
      serveFiles();
      await waitFor(() => component.osmdLoading === false);
    });
  });

  describe('playing', () => {
    it('Play starts the player over the whole score and shows Pause', async () => {
      await openScore();
      const play = vi.spyOn(player, 'play');
      clickPlayPause();
      expect(play).toHaveBeenCalledWith(component.playConfiguration);
      expect(component.isPlaying).toBe(true);
      expect(el().querySelector('#score-info')).toBeNull(); // the toolbar shrinks to play/pause while playing
    });

    it('counts a play started from the beginning of the score', async () => {
      await openScore();
      clickPlayPause();
      expect(scores.scorePlayStatsPost).toHaveBeenCalledWith({ id: 's1' });
    });

    it('does not count a play started later in the score', async () => {
      await openScore();
      component.playConfiguration.scoreRange[0] = 2;
      clickPlayPause();
      expect(scores.scorePlayStatsPost).not.toHaveBeenCalled();
    });

    it('Pause stops the sound and brings the controls back', async () => {
      await openScore();
      clickPlayPause();
      clickPlayPause();
      expect(audio.pause).toHaveBeenCalled();
      expect([component.isPlaying, component.toggleToolbar]).toEqual([false, true]);
    });

    it('a click on the sheet music toggles playback', async () => {
      await openScore();
      button('.score-container').click();
      expect(component.isPlaying).toBe(true);
      button('.score-container').click();
      expect(component.isPlaying).toBe(false);
    });

    it('Reset rewinds to the first bar', async () => {
      await openScore();
      const reset = vi.spyOn(player, 'reset');
      component.playConfiguration.currentStave = 2;
      button('#reset-score').click();
      expect(reset).toHaveBeenCalledWith(component.playConfiguration);
      expect(component.playConfiguration.currentStave).toBe(component.playConfiguration.scoreRange[0]);
      expect(component.isPlaying).toBe(false);
    });

    it('a new tempo changes the playback speed', async () => {
      await openScore();
      const resetLight = vi.spyOn(player, 'resetLight');
      component.onTempoChanged(50); // the score is at 100
      expect(component.playConfiguration.tempoFactor).toBe(0.5);
      expect(component.playConfiguration.delayFactor).toBe(2);
      expect(resetLight).toHaveBeenCalled();
    });

    it('at the end, records the assessment and returns to the stopped state', async () => {
      await openScore();
      await component.start();
      vi.mocked(scores.scorePlayStatsPost).mockClear();
      player.message.set('END');
      render();
      expect(scores.scorePlayStatsPost).toHaveBeenCalledWith(expect.objectContaining({
        id: 's1', title: 'Happy Birthday', assessment: expect.objectContaining({ bad: 0, late: 0 }),
      }));
      expect(component.isPlaying).toBe(false);
    });

    it('flashes the score on a wrong note and shows the keyboard for a while', async () => {
      await openScore();
      component.setHideKeyboard(true);
      vi.useFakeTimers();
      player.message.set('BAD');
      TestBed.tick(); // runs the message effect
      expect(component.arenaClass).toBe('bad');
      expect(component.hideKeyboard).toBe(false);
      vi.advanceTimersByTime(500);
      expect(component.arenaClass).toBe('');
      vi.advanceTimersByTime(4500);
      expect(component.hideKeyboard).toBe(true); // back to the user's choice
    });

    it('moves the bar slider with the cursor', async () => {
      await openScore();
      TestBed.inject(CursorService).measure.set(2);
      render();
      expect(component.playConfiguration.currentStave).toBe(3);
      expect(el().querySelector('#measure-range .noUi-base')).not.toBeNull();
    });
  });

  describe('settings', () => {
    it.each([
      ['#left-hand input', 'waitForLeftHand'],
      ['#right-hand input', 'waitForRightHand'],
    ] as const)('%s waits for that hand, remembered for next time', async (selector, key) => {
      await openScore();
      button(selector).dispatchEvent(new Event('change'));
      expect(component.playConfiguration[key]).toBe(true);
      expect(localStorage.getItem(key)).toBe('true');
    });

    it('restores the remembered settings', async () => {
      localStorage.setItem('waitForRightHand', 'true');
      localStorage.setItem('hideKeyboard', 'true');
      await openScore();
      expect(component.playConfiguration.waitForRightHand).toBe(true);
      expect(component.hideKeyboard).toBe(true);
      expect(el().querySelector('app-keyboard')).toBeNull();
    });

    it('the loop switch loops playback', async () => {
      await openScore();
      button('#loop input').dispatchEvent(new Event('change'));
      expect(component.playConfiguration.isLoop).toBe(true);
    });

    it.each([
      ['setHideFingering', 'hideFingering'],
      ['setHideLyrics', 'hideLyrics'],
      ['setHideFingeringAndHarmony', 'hideFingeringAndHarmony'],
      ['setHideKeyboard', 'hideKeyboard'],
    ] as const)('%s is remembered', async (method, key) => {
      await openScore();
      component[method](true);
      expect(component[key]).toBe(true);
      expect(localStorage.getItem(key)).toBe('true');
    });

    it('opens the MIDI setup and the tempo dialogs', async () => {
      await openScore();
      button('#midi-setup input').click();
      expect(component.isMidiSetupOpen).toBe(true);
      button('#showTempo input').click();
      expect(component.isTempoOpen).toBe(true);
      component.closeTempo();
      expect(component.isTempoOpen).toBe(false);
    });

    it('remembers the metronome from the URL (?useMetronome=1)', async () => {
      component = await harness.navigateByUrl('/work/hill-happy-birthday?useMetronome=1', WorkbenchComponent);
      expect(localStorage.getItem('tempo-control-metronome')).toBe('true');
      component.onMetronomeStatus(false);
      expect(component.playConfiguration.useMetronome).toBe(false);
    });

    it('toggles the toolbar and the keyboard', async () => {
      await openScore();
      component.fnToggleToolBar();
      expect(component.toggleToolbar).toBe(false);
      component.fnToggleToolBar();
      expect(component.toggleToolbar).toBe(true);
      component.fnToggleKeyboard();
      expect(component.hideKeyboard).toBe(true);
    });

    it('hides the toolbar on small screens', async () => {
      await openScore();
      const height = Object.getOwnPropertyDescriptor(window, 'innerHeight')!;
      Object.defineProperty(window, 'innerHeight', { value: 700, configurable: true });
      window.dispatchEvent(new Event('resize'));
      expect(component.toggleToolbar).toBe(false);
      expect(component.isSmallScreen()).toBe(true);
      Object.defineProperty(window, 'innerHeight', height);
    });
  });

  describe('navigation', () => {
    it('the home button stops playback and goes to the summary', async () => {
      await openScore();
      await component.start();
      button('.btn-desktop').click(); // first toolbar button: home
      expect(audio.pause).toHaveBeenCalled();
      expect(navigate).toHaveBeenCalledWith(['/summary']);
    });

    it('the info button opens the score page', async () => {
      await openScore();
      button('#score-info').click();
      expect(navigate).toHaveBeenCalledWith(['/score', 'hill-happy-birthday']);
    });

    it('the info button finds the slug when the score came without one', async () => {
      await openScore();
      component.scoreData = { id: 's1' } as ScoreApiInfo;
      vi.spyOn(scores, 'scoreIdGet').mockReturnValue(of({ mutableSlug: 'draft-slug' }) as never);
      component.showInfo();
      expect(navigate).toHaveBeenCalledWith(['/score', 'draft-slug']);
    });

    it('starts the guided tour', async () => {
      await openScore();
      const start = vi.spyOn(TestBed.inject(BeaconService), 'start');
      button('#help-tour').click();
      expect(start).toHaveBeenCalledWith(WORKBENCH_TOUR); // drawn by <beacon-overlay> in the app shell
    });

    it('releases the session and the exercise data when leaving', async () => {
      await openScore();
      localStorage.setItem(MIDI_STORAGE_KEY, '{}');
      const release = vi.spyOn(player, 'releaseScoreSession');
      await harness.navigateByUrl('/elsewhere');
      expect(release).toHaveBeenCalled();
      expect(localStorage.getItem(MIDI_STORAGE_KEY)).toBeNull();
    });
  });

  describe('exercises (/workbench/scale/...)', () => {
    it('plays the exercise prepared in localStorage', async () => {
      localStorage.setItem(MUSIC_XML_STORAGE_KEY, scoreXml(SIMPLE_SCORE));
      localStorage.setItem(MIDI_STORAGE_KEY, JSON.stringify(scoreMidi(SIMPLE_SCORE).toJSON()));
      localStorage.setItem(EXERCICE_INFO_KEY, JSON.stringify({ tonic: 'C', mode: 'major', title: 'C major scale', kind: 'scale' }));
      component = await harness.navigateByUrl('/workbench/scale/major/C/two_octaves', WorkbenchComponent);
      await waitFor(() => component.osmdLoading === false && !!el().querySelector('.osmd-container svg'));
      expect(component.scoreData).toMatchObject({ id: 'exercise', author: 'C major', title: 'C major scale' });
      expect(component.playConfiguration.midi?.tracks.length).toBe(2);
    });

    it('goes back to the exercise page when the exercise data is missing', async () => {
      vi.spyOn(console, 'info').mockImplementation(() => undefined);
      await harness.navigateByUrl('/workbench/scale/major/C/two_octaves');
      expect(navigate).toHaveBeenCalledWith(['', 'exercises', 'scale', 'major', 'C', 'two_octaves']);
    });
  });
});
