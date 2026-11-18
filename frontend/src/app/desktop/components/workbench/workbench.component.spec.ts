import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse, HttpEventType, HttpResponse, type HttpEvent } from '@angular/common/http';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { page } from 'vitest/browser';
import { Subject, of, throwError } from 'rxjs';
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
import { PracticeSessionRecorder } from '../../service/practice-session-recorder.service';
import { PlayerControlService } from '../../service/player-control.service';
import { WorkbenchComponent, scoreLoadErrorMessage } from './workbench.component';

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

  /** What the exercises page writes before opening an exercise (saveExerciseToStorage). */
  function storeExercise(title: string, kind: 'scale' | 'agility' = 'scale') {
    localStorage.setItem(MUSIC_XML_STORAGE_KEY, scoreXml(SIMPLE_SCORE));
    localStorage.setItem(MIDI_STORAGE_KEY, JSON.stringify(scoreMidi(SIMPLE_SCORE).toJSON()));
    localStorage.setItem(EXERCICE_INFO_KEY, JSON.stringify({ tonic: title.split(' ')[0], mode: kind === 'scale' ? 'major' : 'maj7', title, kind }));
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
          { path: 'workbench/agility/:chordKey/:selectedKey/:exerciseKey', component: WorkbenchComponent },
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
      expect(component.loadingFeedBack).toEqual({ message: 'Downloading the score', percentage: 13 }); // 500 / 4000
      expect(el().querySelector('.loading-feedback')?.textContent).toContain('13%');
      downloads.midi.next({ type: HttpEventType.DownloadProgress, loaded: 1000, total: 1000 });
      expect(component.loadingFeedBack?.percentage).toBe(38); // 1500 / 4000
      serveFiles();
      await waitFor(() => component.osmdLoading === false);
    });

    it('waits until both file sizes are known before showing a percentage', async () => {
      component = await harness.navigateByUrl('/work/hill-happy-birthday', WorkbenchComponent);
      downloads.midi.next({ type: HttpEventType.DownloadProgress, loaded: 1000, total: 1000 });
      expect(component.loadingFeedBack).toEqual({ message: 'Downloading the score', percentage: 0 });
      serveFiles();
      await waitFor(() => component.osmdLoading === false);
    });
  });

  describe('when the browser blocks MIDI', () => {
    const midiPermission = (state: PermissionState) => {
      const status = { state, onchange: null } as unknown as PermissionStatus;
      vi.spyOn(navigator.permissions, 'query').mockResolvedValue(status);
      return status;
    };
    const dialog = () => el().querySelector('[role="alertdialog"]');

    it('says so in a popup that can be closed', async () => {
      midiPermission('denied');
      await openScore();
      await waitFor(() => !!dialog());
      expect(dialog()?.textContent).toContain('MIDI access is blocked by your browser');
      (dialog()?.querySelector('button') as HTMLButtonElement).click();
      render();
      expect(dialog()).toBeNull();
    });

    it('closes the popup once access is allowed', async () => {
      const status = midiPermission('denied');
      await openScore();
      await waitFor(() => !!dialog());
      (status as { state: PermissionState }).state = 'granted';
      status.onchange?.(new Event('change'));
      render();
      expect(dialog()).toBeNull();
    });

    it('shows no popup when MIDI is allowed', async () => {
      midiPermission('granted');
      await openScore();
      expect(navigator.permissions.query).toHaveBeenCalledWith({ name: 'midi' });
      expect(dialog()).toBeNull();
    });
  });

  describe('when the score cannot be loaded', () => {
    const errorBox = () => el().querySelector('[role="alert"]');
    const buttonText = (text: string) =>
      [...el().querySelectorAll('button')].find((b) => b.textContent?.trim() === text) as HTMLButtonElement | undefined;

    beforeEach(() => vi.spyOn(console, 'error').mockImplementation(() => undefined));

    it('replaces the loader with the reason when a file download fails, then loads again on retry', async () => {
      component = await harness.navigateByUrl('/work/hill-happy-birthday', WorkbenchComponent);
      downloads.midi.error(new HttpErrorResponse({ status: 404 }));
      await waitFor(() => component.loadError !== null);
      expect(errorBox()?.textContent).toContain('This score or its files are not available.');
      expect(el().querySelector('.loading-feedback')).toBeNull();
      expect(component.osmdLoading).toBe(false);

      downloads = { midi: new Subject(), musicxml: new Subject() };
      buttonText('Try again')!.click();
      render();
      expect(component.loadError).toBeNull();
      await waitFor(() => vi.mocked(scores.scoreOwnerIdTypeVersionRevisionGet).mock.calls.length === 4);
      serveFiles();
      await waitFor(() => component.osmdLoading === false && !!el().querySelector('.osmd-container svg'));
      expect(errorBox()).toBeNull();
    });

    it('explains an unreachable server and goes back to the score page', async () => {
      component = await harness.navigateByUrl('/work/hill-happy-birthday', WorkbenchComponent);
      downloads.musicxml.error(new HttpErrorResponse({ status: 0 }));
      await waitFor(() => component.loadError !== null);
      expect(errorBox()?.textContent).toContain('the server cannot be reached');
      buttonText('Back to the score')!.click();
      expect(navigate).toHaveBeenCalledWith(['/score', 'hill-happy-birthday']);
    });

    it('reports an unknown score and offers the library instead', async () => {
      vi.mocked(scores.scoreGetBySlug).mockReturnValue(throwError(() => new HttpErrorResponse({ status: 404 })) as never);
      component = await harness.navigateByUrl('/work/hill-happy-birthday', WorkbenchComponent);
      await waitFor(() => component.loadError !== null);
      expect(scores.scoreOwnerIdTypeVersionRevisionGet).not.toHaveBeenCalled();
      buttonText('Back to the library')!.click();
      expect(navigate).toHaveBeenCalledWith(['/library']);
    });

    it('reports an empty or unreadable file', async () => {
      component = await harness.navigateByUrl('/work/hill-happy-birthday', WorkbenchComponent);
      downloads.midi.next(new HttpResponse<Blob>({ body: null }));
      downloads.midi.complete();
      await waitFor(() => component.loadError !== null);
      expect(component.loadError).toBe('The score could not be loaded. Please try again later.');
    });

    it('words each failure', () => {
      expect(scoreLoadErrorMessage(new HttpErrorResponse({ status: 401 }))).toBe('Please log in to practice this score.');
      expect(scoreLoadErrorMessage(new HttpErrorResponse({ status: 403 }))).toBe('You are not allowed to practice this score.');
      expect(scoreLoadErrorMessage(new HttpErrorResponse({ status: 500 }))).toBe('The score could not be loaded. Please try again later.');
      expect(scoreLoadErrorMessage(new Error('x'))).toBe('The score could not be loaded. Please try again later.');
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

    it('at the end, returns to the stopped state without counting the play a second time', async () => {
      await openScore();
      await component.start();
      vi.mocked(scores.scorePlayStatsPost).mockClear();
      player.message.set('END');
      render();
      expect(scores.scorePlayStatsPost).not.toHaveBeenCalled();
      expect(component.isPlaying).toBe(false);
    });

    it('tells the practice recorder which score is on the stand', async () => {
      const setItem = vi.spyOn(TestBed.inject(PracticeSessionRecorder), 'setItem');
      await openScore();
      expect(setItem).toHaveBeenLastCalledWith({ kind: 'score', scoreId: 's1', title: 'Happy Birthday' }, expect.any(Number));
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

  describe('remote control handle (coach, issue #414)', () => {
    const control = () => TestBed.inject(PlayerControlService);

    it('registers while on screen, ready once the score is loaded, and unregisters when left', async () => {
      await openScore();
      const handle = control().handle();
      expect(handle).not.toBeNull();
      expect(handle!.isReady()).toBe(true);
      const state = handle!.getState();
      expect(state).toMatchObject({
        loaded: true, playing: false, page: '/work/hill-happy-birthday',
        item: { kind: 'score', scoreId: 's1', slug: 'hill-happy-birthday', title: 'Happy Birthday' },
        range: { fromMeasure: 1 }, loop: false,
      });
      expect(state.measureTotal).toBe(component.playConfiguration.maxStaveCount);
      expect(state.range.toMeasure).toBe(state.measureTotal);

      await harness.navigateByUrl('/elsewhere');
      expect(control().handle()).toBeNull();
    });

    it('sets a 1-based inclusive range as the slider does', async () => {
      await openScore();
      const resetLight = vi.spyOn(player, 'resetLight');
      // The fixture score has 2 measures
      control().handle()!.setRange(2, 2);
      expect(component.playConfiguration.scoreRange).toEqual([1, 2]);
      expect(component.playConfiguration.currentStave).toBe(1);
      expect(resetLight).toHaveBeenCalledWith(component.playConfiguration);
      expect(control().state().range).toEqual({ fromMeasure: 2, toMeasure: 2 });

      control().handle()!.setWholeScore();
      expect(component.playConfiguration.scoreRange).toEqual([0, component.playConfiguration.maxStaveCount + 1]);
    });

    it('sets tempo (clamped), loop, hands, metronome and keyboard', async () => {
      await openScore();
      const handle = control().handle()!;
      handle.setTempoBpm(500);
      expect(component.tempo).toBe(200);
      handle.setTempoBpm(50);
      expect(control().state().tempo).toEqual({ bpm: 50, originalBpm: 100, percent: 50 });
      handle.setLoop(true);
      handle.setHands('left');
      handle.setMetronome(true);
      handle.setKeyboardVisible(false);
      expect(control().state()).toMatchObject({ loop: true, hands: 'left', metronome: true, showKeyboard: false });
      expect([component.playConfiguration.waitForLeftHand, component.playConfiguration.waitForRightHand]).toEqual([true, false]);
    });

    it('play(restart) starts again from the range start without widening the range; stop pauses', async () => {
      await openScore();
      const handle = control().handle()!;
      handle.setRange(2, 2);
      const reset = vi.spyOn(player, 'reset');
      const play = vi.spyOn(player, 'play');
      await handle.play(true);
      expect(reset).toHaveBeenCalled();
      expect(play).toHaveBeenCalled();
      expect(component.playConfiguration.scoreRange).toEqual([1, 2]);
      expect(control().state().playing).toBe(true);

      handle.stop();
      expect(audio.pause).toHaveBeenCalled();
      expect(control().state().playing).toBe(false);

      reset.mockClear();
      await handle.play(false);
      expect(reset).not.toHaveBeenCalled();
      expect(component.playConfiguration.scoreRange).toEqual([1, 2]);
    });

    it('reports the last take with its accuracy', async () => {
      await openScore();
      const recorder = TestBed.inject(PracticeSessionRecorder);
      recorder.lastTake.set({ measureStart: 1, measureEnd: 2, completed: true, hands: 'both', tempoFactor: 0.6,
        notesExpected: 20, notesHit: 18, notesWrong: 2, onsets: 10, waits: 1 });
      expect(control().state().lastTake).toMatchObject({ completed: true, accuracy: 18 / 22, flow: 0.9 });
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

    it('releases the session when leaving, and keeps an exercise written meanwhile for the next page (#413)', async () => {
      await openScore();
      storeExercise('C major scale');
      const release = vi.spyOn(player, 'releaseScoreSession');
      await harness.navigateByUrl('/elsewhere');
      expect(release).toHaveBeenCalled();
      expect(localStorage.getItem(MIDI_STORAGE_KEY)).not.toBeNull();
      expect(localStorage.getItem(EXERCICE_INFO_KEY)).toContain('C major scale');
    });
  });

  describe('exercises (/workbench/scale/...)', () => {
    async function openExercise(url: string, title: string) {
      component = await harness.navigateByUrl(url, WorkbenchComponent);
      await waitFor(() => component.osmdLoading === false && component.scoreData?.title === title
        && !!el().querySelector('.osmd-container svg'));
      return component;
    }

    it('plays the exercise prepared in localStorage', async () => {
      storeExercise('C major scale');
      await openExercise('/workbench/scale/major/C/two_octaves', 'C major scale');
      expect(component.scoreData).toMatchObject({ id: 'exercise', author: 'C major', title: 'C major scale' });
      expect(component.playConfiguration.midi?.tracks.length).toBe(2);
    });

    it('opens an exercise from a score page: the leaving workbench keeps the data (#413)', async () => {
      await openScore();
      storeExercise('C major scale');
      await openExercise('/workbench/scale/major/C/two_octaves', 'C major scale');
      expect(navigate).not.toHaveBeenCalledWith(expect.arrayContaining(['exercises']), expect.anything());
    });

    it('opens an agility exercise from a scale exercise, and back (#413)', async () => {
      storeExercise('C major scale');
      await openExercise('/workbench/scale/major/C/two_octaves', 'C major scale');
      storeExercise('C maj7 arpeggio', 'agility');
      await openExercise('/workbench/agility/maj7/C/arpeggio', 'C maj7 arpeggio');
      storeExercise('D major scale');
      await openExercise('/workbench/scale/major/D/two_octaves', 'D major scale');
      expect(navigate).not.toHaveBeenCalledWith(expect.arrayContaining(['exercises']), expect.anything());
    });

    it('clears its own exercise when leaving', async () => {
      storeExercise('C major scale');
      await openExercise('/workbench/scale/major/C/two_octaves', 'C major scale');
      await harness.navigateByUrl('/elsewhere');
      for (const key of [MIDI_STORAGE_KEY, MUSIC_XML_STORAGE_KEY, EXERCICE_INFO_KEY]) {
        expect(localStorage.getItem(key)).toBeNull();
      }
    });

    it('goes to the exercise page, parameters in its order, when the exercise data is missing (Back, shared link)', async () => {
      vi.spyOn(console, 'info').mockImplementation(() => undefined);
      await harness.navigateByUrl('/workbench/scale/major/C/two_octaves');
      expect(navigate).toHaveBeenCalledWith(['/', 'exercises', 'scale', 'C', 'major', 'two_octaves'], { replaceUrl: true });
    });
  });
});
