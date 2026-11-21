import { Component, ViewChild, ChangeDetectorRef, ViewEncapsulation, ElementRef, ChangeDetectionStrategy, OnDestroy, effect, PLATFORM_ID, inject, OnInit, untracked, NgZone } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { bootstrapQuestionCircle, bootstrapSpeedometer2, bootstrapGear, bootstrapHouse, bootstrapSkipBackwardFill, bootstrapPlayFill, bootstrapPauseFill, bootstrapRepeat, bootstrapInfoCircleFill, bootstrapFullscreen, bootstrapFullscreenExit, bootstrapGripHorizontal, bootstrapDash, bootstrapPlus } from '@ng-icons/bootstrap-icons';
import { lefthand, righthand } from '../../../shared/icons/custom-icons';
import { ScoreApiInfo, ScoreService, ScorePlayStatsPostRequest } from '../../../core/api';
// biome-ignore lint/style/useImportType: <explanation>
import { SeoService } from '../../../shared/seo';
import { HttpErrorResponse, HttpEventType, type HttpEvent } from '@angular/common/http';
import { firstValueFrom, BehaviorSubject, filter, map, tap } from 'rxjs';
import { Subscription } from 'rxjs';
import { OsmdComponent } from '../osmd/osmd.component';
import { FormsModule } from '@angular/forms';
import { KeyboardComponent } from '../keyboard/keyboard.component';
import { MidiSetupComponent } from '../midi-setup/midi-setup.component';
import { TempoControlComponent } from '../tempo-control/tempo-control.component';
import { LatencyCalibrationComponent } from '../latency-calibration/latency-calibration.component';
import { hasLatencyCalibration } from '../../service/latency-calibration';
import { PlayerService } from '../../service/player.service';
import * as Midi from '@tonejs/midi';
import { EXERCICE_INFO_KEY, MIDI_STORAGE_KEY, MUSIC_XML_STORAGE_KEY, PlayConfiguration } from '../../model/model';
import { exercisesPageFor, shouldClearStoredExercise } from './exercise-storage';
import { BeaconService } from 'ng-beacon';
import { WORKBENCH_TOUR } from './workbench.tour';
import noUiSlider, { PipsMode } from 'nouislider';
import wNumb from 'wnumb';
import { ElapsedTimePipe } from '../../../shared/pipes/elapsed-time.pipe';
import { midiToPitch } from '../../service/midi-maths';
import { CursorService } from '../../service/cursor.service';
import { Note } from '@tonejs/midi/dist/Note';
import { SlopDialogComponent } from '../slop-dialog/slop-dialog.component';
import { markMeasures, measurePipFilter } from './measure-range-pips';
import { PracticeItem, PracticeSessionRecorder } from '../../service/practice-session-recorder.service';
import { MIDI_BLOCKED_MESSAGE, MidiServiceService, queryMidiPermission } from '../../../shared/services/midi-service.service';
import { PlayerAudioService } from '../../service/player-audio.service';
import { type Hands, type PlayerState, PlayerControlService, type WorkbenchHandle, handsOf, lastTakeOf, waitFor } from '../../service/player-control.service';

const DOWNLOADING_SCORE = $localize`:@@workbench.progress.download:Downloading the score`;


/** How long the arena flashes red after a wrong note. */
export const WRONG_NOTE_ARENA_FLASH_MS = 500;

/** What to tell the user when a score cannot be loaded for practice. */
export function scoreLoadErrorMessage(error: unknown): string {
  const status = error instanceof HttpErrorResponse ? error.status : undefined;
  switch (status) {
    case 0:
      return $localize`:@@workbench.error.offline:The score could not be downloaded: the server cannot be reached. Check your connection and try again.`;
    case 401:
      return $localize`:@@workbench.error.login:Please log in to practice this score.`;
    case 403:
      return $localize`:@@workbench.error.forbidden:You are not allowed to practice this score.`;
    case 404:
      return $localize`:@@workbench.error.notFound:This score or its files are not available.`;
    default:
      return $localize`:@@workbench.error.other:The score could not be loaded. Please try again later.`;
  }
}

@Component({
  selector: 'app-workbench',
  imports: [CommonModule, FormsModule, NgIcon, OsmdComponent, KeyboardComponent, MidiSetupComponent, LatencyCalibrationComponent, TempoControlComponent, ElapsedTimePipe, SlopDialogComponent],
  templateUrl: './workbench.component.html',
  styleUrl: './workbench.component.css',
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
  viewProviders: [
    provideIcons({
      bootstrapHouse,
      bootstrapSkipBackwardFill,
      bootstrapPlayFill,
      bootstrapPauseFill,
      bootstrapRepeat,
      bootstrapInfoCircleFill,
      bootstrapFullscreen,
      bootstrapFullscreenExit,
      bootstrapGripHorizontal,
      bootstrapQuestionCircle,
      bootstrapGear,
      bootstrapSpeedometer2,
      bootstrapDash,
      bootstrapPlus,
      lefthand: lefthand.data,
      righthand: righthand.data
    })
  ]
})

export class WorkbenchComponent implements OnInit, OnDestroy {
  showSlopDialog = false;
  /** The browser denies MIDI to the site: /work/:slug says so in a popup, as the setup panel does. */
  showMidiBlockedDialog = false;
  protected readonly midiBlockedMessage = MIDI_BLOCKED_MESSAGE;
  protected get soundFontState() { return this.playerService.soundFontState; }
  private midiPermission: PermissionStatus | null = null;
  private midiBlockedChecked = false;
  /** Wrong notes already reacted to (the player's counter outlives this component). */
  private seenWrongNotes = 0;
  private arenaFlashTimer?: ReturnType<typeof setTimeout>;
  /** The popup opens once per visit, whichever check notices first. */
  private midiBlockedShown = false;



  private platformId = inject(PLATFORM_ID);
  private readonly hideLyricsStorageKey = 'hideLyrics';
  private readonly hideKeyboardStorageKey = 'hideKeyboard';
  private readonly hideFingeringStorageKey = 'hideFingering';
  private readonly hideFingeringAndHarmonyStorageKey = 'hideFingeringAndHarmony';
  private readonly waitForLeftHandStorageKey = 'waitForLeftHand';
  private readonly waitForRightHandStorageKey = 'waitForRightHand';
  // Score data from state
  scoreData: ScoreApiInfo | null = null;
  // Expose loading as an observable to use `async` pipe with OnPush change detection
  loading$ = new BehaviorSubject<boolean>(true);
  /** The tempo the score plays at by default (bpm): the one a different tempo in the URL is compared with. */
  midiOriginalTempo: number = 120;
  /** The timing calibration dialog, offered when a score opens and none was ever made. */
  isCalibrationOpen = false;
  /** The tour started on this score's first visit: the calibration is offered once it ends. */
  private calibrationAfterTour = false;
  /** The MIDI file's own tempo (bpm): what the playback speed factor is relative to. */
  private midiFileTempo = 120;
  /** The measure range is set once per score loaded, not on each re-render (it would undo the user's choice). */
  private measureRangeSet = false;


  get loading() { return this.loading$.value; }
  // loading state for OSMD (use BehaviorSubject to work well with OnPush)
  osmdLoading$ = new BehaviorSubject<boolean>(true);
  get osmdLoading() { return this.osmdLoading$.value; }
  isPlaying = false;
  tempo = 120;
  title = '';
  maxStaveCount = 100; // Placeholder, should be set based on actual score data

  // Cache for parsed MIDI data
  midi: Midi.Midi | null = null;

  // MusicXML content to pass to osmd component
  musicXml: string | null = null;

  // Keyboard bounds (passed to KeyboardComponent)
  keyboardMinKey: string = 'A0';
  keyboardMaxKey: string = 'C8';
  keyboardHeight: number = 100;

  // Observable for elapsed time from PlayerService
  elapsedTime!: any;

  // Reusable decoder
  private static readonly textDecoder = new TextDecoder();

  private readonly tourSeenKey = 'workbench-tour-seen';
  private lastHighlightedElement: HTMLElement | null = null;

  // Loading feedback exposed as observable for OnPush template updates
  loadingFeedBack$ = new BehaviorSubject<{ message: string; percentage: number; } | null>(null);
  get loadingFeedBack() { return this.loadingFeedBack$.value; }
  /** Bytes received / expected per file while the score files download in parallel. */
  private downloadProgress: Record<'midi' | 'musicxml', { loaded: number; total: number }> = {
    midi: { loaded: 0, total: 0 },
    musicxml: { loaded: 0, total: 0 },
  };


  // Configuration
  playConfiguration: PlayConfiguration = {
    maxPerformanceStaveCount: 100,
    maxStaveCount: 100,
    currentStave: 0,
    doSound: true,
    waitForLeftHand: false,
    waitForRightHand: false,
    delayFactor: 1,
    tempoFactor: 1,
    scoreRange: [1, 100],
    isLoop: false,
    staveAndStaveNotesPair: [],
    accompaniment: null,
    midi: null,
    useMetronome: false
  };


  // UI state
  hideKeyboard = false;
  hideFingering = false;
  hideLyrics = false;
  hideFingeringAndHarmony = false;
  arenaClass = '';
  isFullscreen = false;
  isMidiSetupOpen = false;
  // Tempo modal state
  isTempoOpen = false;
  showTempo = false;
  // Control whether the `app-osmd` component is present in the DOM.
  showOsmd = true;
  // Toolbar visibility toggle (true = shown)
  toggleToolbar = true;
  scoreRange = [0, 0, 100];

  @ViewChild('range') range!: ElementRef<HTMLDivElement>;
  @ViewChild('titleContainer', { static: false }) titleContainer!: ElementRef<HTMLDivElement>;
  @ViewChild('titleText', { static: false }) titleText!: ElementRef<HTMLDivElement>;
  slider: any;
  error: string | null = null;
  /** Why the score could not be loaded for practice; replaces the loader with a message and a retry. */
  loadError: string | null = null;
  shouldScroll = false;


  private readonly beaconService = inject(BeaconService);
  private readonly practiceRecorder = inject(PracticeSessionRecorder);
  private readonly playerControl = inject(PlayerControlService);
  private readonly playerAudio = inject(PlayerAudioService);
  private readonly midiService = inject(MidiServiceService);
  /** Stable identity of the exercise on the stand, for the practice history (null for a score). */
  private exerciseItem: PracticeItem | null = null;
  /** The stored exercise this workbench loaded (EXERCICE_INFO_KEY as read): the only one it may clear (#413). */
  private loadedExerciseInfo: string | null = null;
  private routeParamSubscription?: Subscription;
  private readonly ngZone = inject(NgZone);
  /** MIDI setup gave up on a refused permission (e.g. NotAllowedError, while the Permissions API still says "prompt"). */
  private readonly midiBlockedEffect = effect(() => {
    if (this.midiService.midiBlocked() && !this.midiBlockedShown) {
      this.openMidiBlockedDialog();
    }
  });
  private currentLoadId = 0;
  private lastRouteKey: string | null = null;

  constructor(
    private router: Router,
    private route: ActivatedRoute,
    private playerService: PlayerService,
    private cursorService: CursorService,
    private changeDetector: ChangeDetectorRef,
    private scoreService: ScoreService,
    private seo: SeoService
  ) {
    this.setupGeneric();
  }

  setupGeneric() {
    this.loading$.next(true);
    this.loadingFeedBack$.next(null);

    // Initialize elapsed time observable
    this.elapsedTime = this.playerService.elapsedTime;

    this.hideKeyboard = this.parseBooleanStorage(this.hideKeyboardStorageKey);
    this.hideFingering = this.parseBooleanStorage(this.hideFingeringStorageKey);
    this.hideLyrics = this.parseBooleanStorage(this.hideLyricsStorageKey);
    this.hideFingeringAndHarmony = this.parseBooleanStorage(this.hideFingeringAndHarmonyStorageKey);
    this.playConfiguration.waitForLeftHand = this.parseBooleanStorage(this.waitForLeftHandStorageKey);
    this.playConfiguration.waitForRightHand = this.parseBooleanStorage(this.waitForRightHandStorageKey);

    // Effect 1: Tour step highlight (beacon signals only — fires only on tour events)
    effect(() => {
      if (!isPlatformBrowser(this.platformId)) return;

      if (this.beaconService.finished() || this.beaconService.dismissed()) {
        localStorage.setItem(this.tourSeenKey, 'true');
        if (this.calibrationAfterTour) {
          this.calibrationAfterTour = false;
          this.offerCalibration();
        }
      }

      const currentStep = this.beaconService.currentStep();

      if (this.lastHighlightedElement) {
        this.lastHighlightedElement.classList.remove('beacon-highlighted-target');
        this.lastHighlightedElement = null;
      }

      if (currentStep?.selector) {
        const element = document.querySelector(currentStep.selector) as HTMLElement;
        if (element) {
          element.classList.add('beacon-highlighted-target');
          this.lastHighlightedElement = element;
        }
      }
    });

    // Effect 2: Player message END (fires only on player message signal changes)
    effect(() => {
      if (!isPlatformBrowser(this.platformId)) return;

      if (this.playerService.message() === 'END') {
        this.onPlaybackEnded();
      }
    });

    // Effect 2b: wrong notes. A counter, not the BAD message: two wrong notes in a row are two changes, and each
    // one restarts the keyboard timer.
    this.seenWrongNotes = untracked(() => this.playerService.wrongNotes());
    effect(() => {
      if (!isPlatformBrowser(this.platformId)) return;

      const wrongNotes = this.playerService.wrongNotes();
      if (wrongNotes !== this.seenWrongNotes) {
        this.seenWrongNotes = wrongNotes;
        this.onWrongNote();
      }
    });

    // Effect 3: Loading feedback + measure progress + slider (fires on every note advance)
    effect(() => {
      if (!isPlatformBrowser(this.platformId)) return;

      try {
        this.loadingFeedBack$.next(this.cursorService.feedbackSignal());
      } catch (e) {
        //this.loadingFeedBack$.next(null);
      }
    });

    // Effect 4: keep the active stave and slider in sync with the cursor measure signal.
    effect(() => {
      if (!isPlatformBrowser(this.platformId)) return;

      const nextStave = this.cursorService.measure() + 1;
      if (nextStave === this.playConfiguration.currentStave) {
        return;
      }

      this.playConfiguration.currentStave = nextStave;
      this.updateSlider();
      this.changeDetector.markForCheck();
    });
  }

  async ngOnInit(): Promise<void> {
    this.handleResize(); // Initial check
    if (isPlatformBrowser(this.platformId)) {
      window.addEventListener('resize', this.handleResize);
    }

    if (isPlatformBrowser(this.platformId)) {
      // Vérifie si le paramètre de route useMetronome est présent
      const useMetronomeParam = this.route.snapshot.queryParamMap.get('useMetronome');
      if (useMetronomeParam !== null) {
        const value = useMetronomeParam === 'true' || useMetronomeParam === '1';
        localStorage.setItem('tempo-control-metronome', JSON.stringify(value));
      }
    }

    if (isPlatformBrowser(this.platformId)) {
      // Start the heavy soundfont download now, alongside the score, so Play doesn't wait for it.
      // A failure here is not fatal: start() retries the load when the user presses Play.
      this.playerService.initSoundFont().catch((error) => console.warn('SoundFont preload failed', error));
    }

    this.routeParamSubscription = this.route.paramMap.subscribe(() => {
      void this.loadRouteContent();
    });

    if (isPlatformBrowser(this.platformId)) {
      this.playerControl.register(this.controlHandle);
    }
  }

  // --- remote control (coach, issue #414) --------------------------------------------------------------------
  // The same code paths as the toolbar and the slider, so the view, the slider and the practice recorder stay in
  // sync. Measures are 1-based and inclusive here; scoreRange is 1-based with an exclusive end (0 also means the
  // first measure), and currentStave is 1-based.

  private readonly controlHandle: WorkbenchHandle = {
    getState: () => this.controlState(),
    isReady: () => !this.loading && !this.osmdLoading && !this.loadError && this.scoreData != null,
    getLoadError: () => this.loadError,
    setRange: (from, to) => this.controlSetRange(from, to + 1),
    setWholeScore: () => this.controlSetRange(1, this.measureCount() + 1),
    setTempoBpm: (bpm) => {
      this.onTempoChanged(Math.round(Math.min(TempoControlComponent.MAX, Math.max(TempoControlComponent.MIN, bpm))));
    },
    setLoop: (value) => {
      this.playConfiguration.isLoop = value;
      this.changeDetector.markForCheck();
    },
    setHands: (value: Hands) => {
      const hands = waitFor(value);
      this.setWaitForLeftHand(hands.left);
      this.setWaitForRightHand(hands.right);
    },
    setMetronome: (value) => this.onMetronomeStatus(value),
    setKeyboardVisible: (value) => this.setHideKeyboard(!value),
    play: async (restart) => {
      if (restart) {
        // Not this.reset(): at the range start it widens the range to the whole score
        this.playConfiguration.currentStave = this.playConfiguration.scoreRange[0];
        await this.playerService.reset(this.playConfiguration);
        this.updateSlider();
      }
      this.changeDetector.markForCheck();
      // start() does nothing until the sounds are loaded (Play is disabled meanwhile): a remote play waits for them
      await this.playerService.initSoundFont();
      await this.start();
      this.changeDetector.markForCheck();
    },
    stop: () => {
      this.stop();
      this.changeDetector.markForCheck();
    },
  };

  /** What the slider's 'end' handler does, for a range given as scoreRange values. */
  private controlSetRange(start: number, end: number): void {
    this.playConfiguration.scoreRange[0] = start;
    this.playConfiguration.scoreRange[1] = end;
    this.playConfiguration.currentStave = start;
    this.playerService.resetLight(this.playConfiguration);
    this.updateSlider();
    this.changeDetector.markForCheck();
  }

  private controlState(): PlayerState {
    const config = this.playConfiguration;
    const score = this.scoreData;
    const take = this.practiceRecorder.lastTake();
    const original = this.midiOriginalTempo || this.tempo || 120;
    return {
      loaded: !this.loading && !this.osmdLoading && !this.loadError && score != null,
      loading: this.loading || (this.osmdLoading && !this.loadError),
      page: this.router.url,
      item: score == null ? null : score.id === 'exercise'
        ? { kind: 'exercise', title: score.title ?? '', author: score.author, tonic: score.tonic, mode: score.mode }
        : { kind: 'score', scoreId: score.id, slug: score.immutableSlug || score.mutableSlug, title: score.title ?? '', author: score.author, tonic: score.tonic, mode: score.mode },
      measureTotal: this.measureCount(),
      playing: this.isPlaying,
      currentMeasure: Math.max(1, config.currentStave),
      range: { fromMeasure: Math.max(1, config.scoreRange[0]), toMeasure: Math.min(config.scoreRange[1] - 1, this.measureCount()) },
      tempo: { bpm: this.tempo, originalBpm: original, percent: Math.round((100 * this.tempo) / original) },
      loop: config.isLoop,
      hands: handsOf(config.waitForLeftHand, config.waitForRightHand),
      metronome: config.useMetronome,
      showKeyboard: !this.hideKeyboard,
      midiInput: this.midiInputState(),
      audioUnlocked: this.playerAudio.isUnlocked(),
      lastTake: take == null ? null : lastTakeOf(take),
    };
  }

  private midiInputState(): PlayerState['midiInput'] {
    if (this.midiPermission?.state === 'denied') {
      return 'blocked';
    }
    const enabled = this.midiService.enabledInputDevices;
    if (!enabled) {
      return 'unknown';
    }
    return [...enabled.values()].some(device => device.state === 'connected') ? 'connected' : 'none';
  }

  private async loadRouteContent(): Promise<void> {
    const routeKey = this.router.url;
    if (routeKey === this.lastRouteKey) {
      return;
    }

    this.lastRouteKey = routeKey;
    const loadId = ++this.currentLoadId;

    if (this.router.url.startsWith('/work/')) {
      void this.checkMidiBlocked();
      await this.prepareScoreLoad(loadId);
      await this.setupWorkMode(loadId);
    } else if (
      this.router.url.startsWith('/workbench/scale')
      || this.router.url.startsWith('/workbench/agility')
    ) {
      await this.prepareScoreLoad(loadId);
      await this.setupExerciseMode(loadId);
    } else if (this.router.url.startsWith('/workbench/sightreadng')) {
      this.setupSightReadingMode();
    }
  }

  /** Opens the MIDI-blocked popup once per visit when the browser denies MIDI; closes it if access is granted meanwhile. */
  private async checkMidiBlocked(): Promise<void> {
    if (!isPlatformBrowser(this.platformId) || this.midiBlockedChecked) return;
    this.midiBlockedChecked = true;
    this.midiPermission = await queryMidiPermission();
    if (!this.midiPermission) return;
    this.midiPermission.onchange = () => {
      if (this.midiPermission?.state !== 'denied') {
        this.closeMidiBlockedDialog();
      }
    };
    if (this.midiPermission.state === 'denied' && !this.midiBlockedShown) {
      this.openMidiBlockedDialog();
    }
  }

  private openMidiBlockedDialog(): void {
    this.midiBlockedShown = true;
    this.showMidiBlockedDialog = true;
    this.changeDetector.markForCheck();
  }

  /**
   * Flashes the arena (the wrong note itself is shown on the score; the on-screen keyboard is left as it is).
   */
  private onWrongNote(): void {
    this.arenaClass = 'bad';
    clearTimeout(this.arenaFlashTimer);
    this.arenaFlashTimer = setTimeout(() => {
      this.arenaClass = '';
      this.changeDetector.markForCheck();
    }, WRONG_NOTE_ARENA_FLASH_MS);
    this.changeDetector.markForCheck();
  }

  closeMidiBlockedDialog() {
    this.showMidiBlockedDialog = false;
    this.changeDetector.markForCheck();
  }

  private async prepareScoreLoad(loadId: number): Promise<void> {
    this.loading$.next(true);
    this.osmdLoading$.next(true);
    this.loadingFeedBack$.next({ message: $localize`:@@workbench.progress.reset:Resetting the previous score`, percentage: 0 });
    this.showOsmd = false;
    this.isPlaying = false;
    this.error = null;
    this.loadError = null;
    this.playerService.releaseScoreSession();
    this.clearData();
    this.changeDetector.markForCheck();
    await Promise.resolve();

    if (loadId !== this.currentLoadId) {
      return;
    }
  }

  // Resize handler to enforce toolbar visible on small screens
  private handleResize = () => {
    const smallScreen = window.innerHeight <= 768;
    if (smallScreen) {
      this.toggleToolbar = false;
      this.changeDetector.markForCheck();
    }
  }

  isSmallScreen() {
    return (window.innerHeight <= 768 || window.innerWidth <= 1024);
  }

  fnToggleToolBar() {
    this.toggleToolbar = !this.toggleToolbar
    if (this.toggleToolbar) {
      this.changeDetector.markForCheck();
      setTimeout(() => {
        this.setupSlider();
      }, 300);
    }
  }

  fnToggleKeyboard() {
    this.hideKeyboard = !this.hideKeyboard;
  }

  startTour() {
    this.beaconService.start(WORKBENCH_TOUR);
  }


  async setupWorkMode(loadId: number) {
    const slug = this.route.snapshot.paramMap.get('slug');
    let midiResult: Midi.Midi;
    let musicXmlResult: string;
    try {
      this.scoreData = await firstValueFrom(this.scoreService.scoreGetBySlug(slug!));
      if (loadId !== this.currentLoadId) {
        return;
      }
      this.downloadProgress = { midi: { loaded: 0, total: 0 }, musicxml: { loaded: 0, total: 0 } };
      this.loadingFeedBack$.next({ message: DOWNLOADING_SCORE, percentage: 0 });
      [midiResult, musicXmlResult] = await Promise.all([
        this.downloadMidi(this.scoreData!),
        this.downloadMusicXML(this.scoreData!)
      ]);
    } catch (error) {
      // A failed download used to be swallowed: the loader stayed up, then the page crashed on the missing MIDI
      if (loadId === this.currentLoadId) {
        this.failLoad(error);
      }
      return;
    }
    if (loadId !== this.currentLoadId) {
      return;
    }
    this.midi = midiResult;
    this.musicXml = musicXmlResult;
    this.playConfiguration = this.playerService.preconfigurePlayConfiguration(this.scoreData!, this.playConfiguration, this.midi!);
    this.practiceRecorder.setItem(
      { kind: 'score', scoreId: this.scoreData!.id!, title: this.scoreData!.title },
      this.playConfiguration.maxStaveCount
    );
    // Compute keyboard bounds from MIDI notes (if available)
    const smallScreen = window.innerWidth <= 1024;
    if (smallScreen) {
      this.loadingFeedBack$.next({ message: $localize`:@@workbench.progress.midiBounds:Computing the MIDI range`, percentage: 15 });
      this.changeDetector.detectChanges()
      const allNotes: Note[] = this.midi.tracks.flatMap(track => track.notes).filter(note => note.midi !== undefined);
      const minNote = allNotes.reduce((acc: Note, n: Note) => {
        return (n.midi ?? 0) < (acc.midi ?? 0) ? n : acc;
      }, allNotes[0]);
      const maxNote = allNotes.reduce((acc: Note, n: Note) => {
        return (n.midi ?? 0) > (acc.midi ?? 0) ? n : acc;
      }, allNotes[0]);
      const minMidiRaw = minNote.midi;
      const bottomCdelta = Math.abs(minMidiRaw - 60);
      if (this.keyboardMinKey == "C1") {
        this.keyboardMinKey = "A0";
      }
      const maxMidiRaw = maxNote.midi;
      const topCdelta = Math.abs(maxMidiRaw - 60);
      const delta = Math.max(Math.max(bottomCdelta, topCdelta), 11);
      const minCMidi = Math.max((Math.floor(minMidiRaw / 12) * 12) - 12, 60 - delta);
      const maxCMidi = 60 + delta;
      this.keyboardMinKey = midiToPitch(minCMidi);
      this.keyboardMaxKey = midiToPitch(maxCMidi);
      const octaveCount = Math.max(1, Math.ceil((maxCMidi - minCMidi + 1) / 12));
      this.keyboardHeight = 180 * (octaveCount / 8);
    }
    this.showOsmd = true;
    this.onLoaded();
  }


  onLoaded() {
    // The default: the MIDI file's tempo, scaled by preconfigurePlayConfiguration() when the score sets its own
    this.midiFileTempo = this.midi?.header.tempos[0]?.bpm || 120;
    this.midiOriginalTempo = Math.round(this.midiFileTempo * this.playConfiguration.tempoFactor);
    this.tempo = this.midiOriginalTempo;
    this.applyTempoFromUrl();
    this.measureRangeSet = false;
    // ?loop=1 (a deep link): the score plays in a loop
    const loop = this.route.snapshot.queryParamMap.get('loop');
    this.playConfiguration.isLoop = loop === '1' || loop === 'true';
    this.loadingFeedBack$.next({ message: $localize`:@@workbench.progress.configuration:Building the configuration`, percentage: 30 });
    this.loading$.next(false);
    this.changeDetector.markForCheck();

    // Auto-start tour if never seen
    if (isPlatformBrowser(this.platformId) && !localStorage.getItem(this.tourSeenKey)) {
      this.calibrationAfterTour = true;
      setTimeout(() => {
        this.startTour();
      }, 1000);
    } else if (isPlatformBrowser(this.platformId)) {
      this.offerCalibration();
    }
  }

  /** A score opened without a timing calibration ever made: the calibration is offered (after the tour, on a first visit). */
  private offerCalibration(): void {
    if (this.scoreData?.id !== 'exercise' && !hasLatencyCalibration()) {
      this.isCalibrationOpen = true;
      this.changeDetector.markForCheck();
    }
  }

  setupSightReadingMode() {
    throw new Error('Method not implemented.');
  }

  async setupExerciseMode(loadId: number) {
    this.loadExcerciceFromLocalStorage();
    if (this.midi && this.scoreData) {
      this.playConfiguration = this.playerService.preconfigurePlayConfiguration(this.scoreData, this.playConfiguration, this.midi);
      this.practiceRecorder.setItem(this.exerciseItem, this.playConfiguration.maxStaveCount);
    }
    setTimeout(async () => {
      if (loadId !== this.currentLoadId) {
        return;
      }
      if (this.playConfiguration.midi && this.cursorService && this.cursorService.cursor) {
        console.log('Setting up cursor with MIDI data for exercise mode');
        await this.cursorService.setup(this.cursorService.cursor, this.playConfiguration.midi);
      }
      this.showOsmd = true;
      this.onLoaded();
      this.changeDetector.markForCheck();
    }, 1000);

  }

  parseBooleanStorage(key: string): boolean {
    if (!isPlatformBrowser(this.platformId)) return false;
    const stored = localStorage.getItem(key);
    if (stored !== null) {
      try {
        return JSON.parse(stored);
      } catch {
        return stored === 'true';
      }
    }
    return false;
  }

  openMidiSetup() {
    this.isMidiSetupOpen = true;
  }

  closeMidiSetup() {
    this.isMidiSetupOpen = false;
    //window.location.reload();
    this.reloadOsmd(50);
  }

  openTempo() {
    this.isTempoOpen = true;
    this.showTempo = true;
    this.changeDetector.markForCheck();
  }

  closeTempo() {
    this.isTempoOpen = false;
    this.showTempo = false;
    this.changeDetector.markForCheck();
  }

  onMetronomeStatus(value: boolean) {
    this.playConfiguration.useMetronome = value;
    this.changeDetector.markForCheck();
  }

  onCountInChange(bars: number) {
    this.playConfiguration.countInBars = bars;
    this.changeDetector.markForCheck();
  }

  onTempoChanged(newTempo: number) {
    this.tempo = newTempo;
    this.setSpeed(this.tempo / this.midiFileTempo);
    this.writeUrlState();
    this.changeDetector.markForCheck();
  }

  /** A score opened with ?tempo=N (a deep link) plays at N bpm: any whole tempo the tempo control accepts. */
  private applyTempoFromUrl(): void {
    const param = this.route.snapshot.queryParamMap.get('tempo');
    const tempo = param === null || param.trim() === '' ? NaN : Number(param);
    if (Number.isInteger(tempo) && tempo >= TempoControlComponent.MIN && tempo <= TempoControlComponent.MAX && tempo !== this.midiOriginalTempo) {
      this.tempo = tempo;
      this.setSpeed(tempo / this.midiFileTempo);
    }
  }

  /** The loop button: the score starts again at the end of its range, and the URL says so (loop=1). */
  toggleLoop(): void {
    this.playConfiguration.isLoop = !this.playConfiguration.isLoop;
    this.writeUrlState();
    this.changeDetector.markForCheck();
  }

  /** Measures in the score, as the slider counts them. */
  private measureCount(): number {
    return this.cursorService.osmdMeasureCount || this.playConfiguration.maxStaveCount;
  }

  /** The range on the whole score: measures 1 to the last one (the end is exclusive). */
  private setWholeScore(): void {
    this.playConfiguration.scoreRange[0] = 1;
    this.playConfiguration.scoreRange[1] = this.measureCount() + 1;
  }

  /**
   * Once the score is rendered (its measures counted): the whole score, or the measures of the link when it was
   * opened with ?measureStart=A&measureEnd=B (a deep link), A to B as the slider shows them (1-based, B
   * included). Either can be left out (the first or the last measure); measures out of the score are ignored.
   */
  private applyMeasureRange(): void {
    const count = this.measureCount();
    if (this.measureRangeSet || count < 1) return;
    this.measureRangeSet = true;
    // The range preconfigurePlayConfiguration() set comes from the MIDI notes, before the measures were counted
    this.setWholeScore();
    this.playConfiguration.currentStave = 1;
    const read = (name: string, fallback: number) => {
      const param = this.route.snapshot.queryParamMap.get(name);
      const value = param === null || param.trim() === '' ? fallback : Number(param);
      return Number.isInteger(value) ? value : NaN;
    };
    const first = read('measureStart', 1);
    const last = read('measureEnd', count);
    if (!(first >= 1 && first <= last && last <= count) || (first === 1 && last === count)) return;
    this.playConfiguration.scoreRange[0] = first;
    this.playConfiguration.scoreRange[1] = last + 1;
    this.playConfiguration.currentStave = first;
    this.playerService.resetLight(this.playConfiguration);
  }

  /**
   * What makes the score worth sharing as it is, in the URL (other parameters kept): a tempo other than the
   * score's own, measures other than the whole score (as the slider shows them), the loop. Out of the URL otherwise.
   */
  private writeUrlState(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    const [start, end] = this.playConfiguration.scoreRange;
    const first = Math.max(1, start);
    const last = Math.min(end - 1, this.measureCount());
    const wholeScore = first <= 1 && last >= this.measureCount();
    const wanted: Record<string, string | null> = {
      tempo: this.tempo === this.midiOriginalTempo ? null : String(this.tempo),
      measureStart: wholeScore ? null : String(first),
      measureEnd: wholeScore ? null : String(last),
      loop: this.playConfiguration.isLoop ? '1' : null,
    };
    const current = this.route.snapshot.queryParamMap;
    if (Object.entries(wanted).every(([name, value]) => current.get(name) === value)) return;
    this.router.navigate([], { relativeTo: this.route, queryParams: wanted, queryParamsHandling: 'merge', replaceUrl: true });
  }

  setHideKeyboard(value: boolean) {
    this.hideKeyboard = value;
    if (isPlatformBrowser(this.platformId)) {
      localStorage.setItem(this.hideKeyboardStorageKey, JSON.stringify(value));
    }
    this.changeDetector.markForCheck();
  }

  setHideFingering(value: boolean) {
    this.hideFingering = value;
    if (isPlatformBrowser(this.platformId)) {
      localStorage.setItem(this.hideFingeringStorageKey, JSON.stringify(value));
    }
    this.changeDetector.markForCheck();
  }


  setHideLyrics(value: boolean) {
    this.hideLyrics = value;
    if (isPlatformBrowser(this.platformId)) {
      localStorage.setItem(this.hideLyricsStorageKey, JSON.stringify(value));
    }
    this.changeDetector.markForCheck();
  }


  setHideFingeringAndHarmony(value: boolean) {
    this.hideFingeringAndHarmony = value;
    if (isPlatformBrowser(this.platformId)) {
      localStorage.setItem(this.hideFingeringAndHarmonyStorageKey, JSON.stringify(value));
    }
    this.changeDetector.markForCheck();
  }


  setWaitForLeftHand(value: boolean) {
    this.playConfiguration.waitForLeftHand = value;
    if (isPlatformBrowser(this.platformId)) {
      localStorage.setItem(this.waitForLeftHandStorageKey, JSON.stringify(value));
    }
    this.changeDetector.markForCheck();
  }

  setWaitForRightHand(value: boolean) {
    this.playConfiguration.waitForRightHand = value;
    if (isPlatformBrowser(this.platformId)) {
      localStorage.setItem(this.waitForRightHandStorageKey, JSON.stringify(value));
    }
    this.changeDetector.markForCheck();
  }


  reloadOsmd(delay = 50) {
    window.location.reload(); // can do bertter
    // this.changeDetector.markForCheck();
    // setTimeout(() => {
    //   this.showOsmd = true;
    //     this.changeDetector.markForCheck();
    // }, delay);
  }

  private titleTimer?: ReturnType<typeof setTimeout>;

  onOsmdLoadingChange(loading: boolean) {
    if (loading) {
      return;
    }
    this.osmdLoading$.next(loading);
    this.changeDetector.markForCheck();
    this.applyMeasureRange();
    this.setupSlider();
    clearTimeout(this.titleTimer);
    this.titleTimer = setTimeout(() => {
      this.titleTimer = undefined;
      if (!this.scoreData) return; // left the workbench meanwhile
      this.title = `${this.scoreData.author} - ${this.scoreData.title}`;
      this.updatePageTitle()
      this.changeDetector.detectChanges();
      this.checkIfScrollNeeded();
    }, 100);
  }

  /** The exercise data is gone (Back to the URL after leaving it, a shared link): its exercises page instead. */
  failOnLocalStorage() {
    // /workbench/scale/major/Eb/left_than_right --> /exercises/scale/Eb/major/left_than_right
    this.router.navigate(exercisesPageFor(this.router.url), { replaceUrl: true });
  }

  loadExcerciceFromLocalStorage(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    if (
      !localStorage.getItem(MUSIC_XML_STORAGE_KEY)
      || !localStorage.getItem(MIDI_STORAGE_KEY)
      || !localStorage.getItem(EXERCICE_INFO_KEY)
    ) {
      console.info('No MusicXML found in localStorage');
      this.failOnLocalStorage();
      return;
    }
    this.loadedExerciseInfo = localStorage.getItem(EXERCICE_INFO_KEY);
    // Load MusicXML from localStorage
    this.musicXml = localStorage.getItem(MUSIC_XML_STORAGE_KEY);
    // Load MIDI from localStorage
    try {
      this.midi = new Midi.Midi();
      this.midi.fromJSON(JSON.parse(localStorage.getItem(MIDI_STORAGE_KEY)!));
    } catch (error) {
      console.error('Failed to parse MIDI from localStorage:', error);
      this.midi = null;
    }

    const exerciceInfo = JSON.parse(localStorage.getItem(EXERCICE_INFO_KEY)!);
    this.scoreData = {
      id: 'exercise',
      author: exerciceInfo.tonic + " " + exerciceInfo.mode,
      title: exerciceInfo.title || 'Exercise',
      owner_id: 'local',
      tonic: exerciceInfo?.tonic,
      mode: exerciceInfo?.mode,
      genre: exerciceInfo?.kind
    } as ScoreApiInfo;
    // Exercises stored before these keys existed are simply not recorded
    this.exerciseItem = exerciceInfo?.exerciseType && exerciceInfo?.patternKey && exerciceInfo?.exerciseKey && exerciceInfo?.tonic
      ? {
        kind: 'exercise',
        exerciseType: exerciceInfo.exerciseType,
        patternKey: exerciceInfo.patternKey,
        exerciseKey: exerciceInfo.exerciseKey,
        tonic: exerciceInfo.tonic,
        mode: exerciceInfo.mode,
        title: exerciceInfo.title,
      }
      : null;

  }

  async downloadMidi(scoreData: ScoreApiInfo): Promise<Midi.Midi> {
    await this.loadScoreData(scoreData, 'midi', async (data) => {
      const arrayBuffer = await data.arrayBuffer();
      const midi = new Midi.Midi(arrayBuffer);
      if (!(scoreData.study_tracks && scoreData.study_tracks.length > 0)) {
        midi.tracks = midi.tracks.filter(track => track.notes.length > 0);
      }
      this.midi = midi;
      // No return value needed
    });
    return this.midi!;
  }

  async downloadMusicXML(scoreData: ScoreApiInfo): Promise<string> {
    await this.loadScoreData(scoreData, 'musicxml', async (data) => {
      const arrayBuffer = await data.arrayBuffer();
      const xmlText = WorkbenchComponent.textDecoder.decode(arrayBuffer);
      this.musicXml = xmlText;
      // No return value needed
    });
    return this.musicXml!;
  }


  /** Downloads one score file and hands it to {@code processor}. Failures propagate: setupWorkMode reports them. */
  private async loadScoreData(
    scoreData: ScoreApiInfo,
    type: 'midi' | 'musicxml',
    processor: (data: any) => Promise<void>
  ): Promise<void> {
    const data = await firstValueFrom(
      this.scoreService.scoreOwnerIdTypeVersionRevisionGet(scoreData!.owner_id!, scoreData!.id!, type, scoreData.version || 1, 1, 'events', true).pipe(
        tap((event: HttpEvent<Blob>) => {
          if (event.type === HttpEventType.DownloadProgress) {
            this.reportDownloadProgress(type, event.loaded, event.total);
          }
        }),
        filter((event: HttpEvent<Blob>) => event.type === HttpEventType.Response),
        map((event) => event.body)
      )
    );
    if (!data) {
      throw new Error(`Empty ${type} file`);
    }
    await processor(data);
  }

  /**
   * Combined percentage of both files. Only reported once every file has announced its size:
   * otherwise a small file finishing first would read as 100% before the other one starts.
   */
  private reportDownloadProgress(type: 'midi' | 'musicxml', loaded: number, total?: number): void {
    this.downloadProgress[type] = { loaded, total: total ?? 0 };
    const files = Object.values(this.downloadProgress);
    if (files.some((f) => !f.total)) {
      return;
    }
    const expected = files.reduce((sum, f) => sum + f.total, 0);
    const received = files.reduce((sum, f) => sum + Math.min(f.loaded, f.total), 0);
    this.loadingFeedBack$.next({ message: DOWNLOADING_SCORE, percentage: Math.min(100, Math.round((received / expected) * 100)) });
  }

  /** Stops the loader and tells why the score cannot be practiced, with a retry (see the template). */
  private failLoad(error: unknown): void {
    console.error('Could not load the score', error);
    this.loadError = scoreLoadErrorMessage(error);
    this.loading$.next(false);
    this.osmdLoading$.next(false);
    this.changeDetector.markForCheck();
  }

  /** Loads the score again after a failure. */
  retryLoad(): void {
    this.lastRouteKey = null;
    void this.loadRouteContent();
  }

  /** Back to the score page, or the library when the score itself could not be loaded. */
  leaveFailedLoad(): void {
    const slug = this.scoreData?.immutableSlug ?? this.route.snapshot.paramMap.get('slug');
    this.router.navigate(slug && this.scoreData ? ['/score', slug] : ['/library']);
  }


  summary() {
    if (this.isPlaying) {
      this.stop();
    }
    this.router.navigate(['/summary']);
  }

  showInfo() {
    const slug = this.scoreData?.immutableSlug || this.scoreData?.mutableSlug;
    if (slug) {
      this.router.navigate(['/score', slug]);
      return;
    }
    if (this.scoreData?.id) {
      this.scoreService.scoreIdGet(this.scoreData.id).subscribe({
        next: (fullScore) => {
          const fallbackSlug = fullScore.immutableSlug || fullScore.mutableSlug;
          if (fallbackSlug) {
            this.router.navigate(['/score', fallbackSlug]);
          } else {
            this.router.navigate(['/library']);
          }
        },
        error: (e) => {
          this.router.navigate(['/library'])
        }
      });
    }
  }

  reset() {
    this.setSliderState(true);
    if (this.playConfiguration.currentStave === this.playConfiguration.scoreRange[0]) {
      this.setWholeScore();
    }
    this.playConfiguration.currentStave = this.playConfiguration.scoreRange[0];
    this.playerService.reset(this.playConfiguration);
    this.isPlaying = false;

    this.updateSlider();
    this.writeUrlState();
  }

  /** Plays at `speed` times the MIDI file's tempo (the notes and the count-in alike). */
  setSpeed(speed: number) {
    // delayFactor stays 1: the time factor is 1 / (tempoFactor / delayFactor), and setting it to 1 / speed too made
    // the notes play at speed² (a 50 bpm choice on a 100 bpm score played at 25, the count-in at 50)
    this.playConfiguration.delayFactor = 1;
    this.playConfiguration.tempoFactor = speed;
    this.playerService.resetLight(this.playConfiguration);
  }

  toggleFullscreen() {
    if (!document.fullscreenElement) {
      // Enter fullscreen
      document.documentElement.requestFullscreen().then(() => {
        this.isFullscreen = true;
        this.changeDetector.markForCheck();
      }).catch((err) => {
        console.error('Error attempting to enable fullscreen:', err);
      });
    } else {
      // Exit fullscreen
      document.exitFullscreen().then(() => {
        this.isFullscreen = false;
        this.changeDetector.markForCheck();
      }).catch((err) => {
        console.error('Error attempting to exit fullscreen:', err);
      });
    }
  }

  /** Playback can only start once the sounds are loaded, by any route (Play, a click on the score). */
  private soundsReady(): boolean {
    return this.playerService.soundFontState() === 'ready';
  }

  /** The Retry button after a failed sound download. */
  retrySounds(): void {
    this.playerService.initSoundFont().catch((error) => console.warn('SoundFont load failed again', error));
  }

  async start() {
    if (!this.soundsReady()) return;
    this.toggleToolbar = this.isSmallScreen() ? false : true;
    this.isPlaying = true;

    this.setSliderState(false);
    // Count a play when it starts from the first bar. scoreRange[0] is 1-based, with 0 (the default before the
    // slider is touched) also meaning the first bar.
    if (this.scoreData?.id && this.scoreData.id !== 'exercise' && this.playConfiguration.scoreRange[0] <= 1) {
      const request: ScorePlayStatsPostRequest = { id: this.scoreData.id };
      this.scoreService.scorePlayStatsPost(request).subscribe({
        next: () => { },
        error: (error) => console.warn('Failed to register play stats:', error)
      });
    }
    await this.playerService.play(this.playConfiguration);
  }

  startStop() {
    if (!this.soundsReady()) return;
    if (this.isPlaying) {
      this.stop();
    } else {
      this.start();
    }
  }

  stop() {
    this.toggleToolbar = true;
    this.setSliderState(true);
    this.playerService.pause();
    this.isPlaying = false;
  }

  /**
   * The score played to its end (the take is recorded by the player, see PracticeSessionRecorder). Same UI state as stop() (toolbar back, measure range unlocked), except in loop
   * mode where the player restarts right away and stays "playing".
   */
  onPlaybackEnded() {
    if (!this.playConfiguration.isLoop) {
      this.isPlaying = false;
      this.toggleToolbar = true;
      this.setSliderState(true);
    }
    this.changeDetector.markForCheck();
  }

  private setSliderState(enabled: boolean) {
    if (!this.slider) return;
    if (enabled) {
      this.slider.enable();
    } else {
      this.slider.disable();
    }
  }

  setupSlider() {
    if (!this.range) return;
    if (this.slider) {
      this.slider.destroy();
    }
    this.slider = noUiSlider.create(this.range.nativeElement, {
      ...this.getSliderBaseConfig(),
      pips: {
        mode: PipsMode.Steps,
        density: 100,
        // A few measure numbers and fine marks, not a number under every measure
        filter: measurePipFilter(this.measureCount()),
        format: wNumb({
          decimals: 0,
          encoder: (i: number) => Math.round(i + 1),
          decoder: (i: string | number) => Math.round(Number(i) - 1)
        }),
      },
      tooltips: [
        false,
        false,
        false
      ],
      step: 1,
      format: {
        to: (value: number) => (Math.round(value) + 1).toString(),
        from: (value: string) => Math.round(Number(value) - 1)
      }
    });

    // The measures to be played (start to end handle) in white, the elapsed ones (start handle to current measure)
    // in emerald: the fills between the handles (connect) and their marks and numbers, marked on every update
    // (playback moves the current handle; updateOptions() rebuilds the pips)
    this.slider.on('update', (values: (string | number)[]) => this.markMeasures(values));

    this.slider.on('start', (values: (string | number)[]) => {
      const tooltips = [
        true,
        true,
        true
      ];
      this.slider.updateOptions({
        tooltips: tooltips,
      });
    });

    this.slider.on('end', (values: (string | number)[]) => {
      // The handles show 1-based measures and the end handle is the last measure played (inclusive),
      // while scoreRange[1] is exclusive: the player plays measures scoreRange[0] .. scoreRange[1] - 1.
      const numValues = values.map(v => Math.round(Number(v)));
      let [start, current, last] = numValues;
      const [oldStart, oldCurrent, oldLast] = [
        this.playConfiguration.scoreRange[0],
        this.playConfiguration.currentStave,
        this.playConfiguration.scoreRange[1] - 1
      ];
      // detect what changed; a single measure (start === last) is a valid range
      if (current != oldCurrent) {
        current = Math.min(current, last);
        start = current;
      } else if (start != oldStart) {
        start = Math.min(start, last);
        current = start;
      } else if (last != oldLast) {
        last = Math.max(last, start);
        current = start;
      }

      this.playConfiguration.scoreRange[0] = start;
      this.playConfiguration.currentStave = current;
      this.playConfiguration.scoreRange[1] = last + 1;
      this.playerService.resetLight(this.playConfiguration);
      // Hides the tooltips the 'start' handler showed for the drag
      this.slider.updateOptions({ tooltips: [false, false, false] });
      this.updateSlider();
      this.writeUrlState();
    });
  }

  /** The slider's formatted values are 1-based measures: the pips are placed on the 0-based ones. */
  private markMeasures(values: (string | number)[]): void {
    const pips = this.range?.nativeElement.querySelector('.noUi-pips') ?? null;
    const [start, current, end] = values.map(value => Number(value) - 1);
    markMeasures(pips, start, current, end, Math.max(0, this.measureCount() - 1));
  }

  updateSlider() {
    if (!this.slider) return;
    const newValues = [
      this.playConfiguration.scoreRange[0],
      this.playConfiguration.currentStave,
      this.playConfiguration.scoreRange[1] - 1 // the end handle shows the last measure played
    ];
    // set() moves the handles; updateOptions() rebuilt every pip and tooltip, on each new measure while playing.
    // fireSetEvent false: no 'set' event for a move the code made itself. Outside the zone: noUiSlider's own
    // class timers would otherwise run change detection app-wide on each new measure.
    this.ngZone.runOutsideAngular(() => this.slider.set(newValues, false));
  }


  private getSliderBaseConfig() {
    const sliderConfig = {
      behaviour: 'unconstrained' as const,
      // Filled between the handles: start to current measure, the measures already played (emerald); current
      // measure to end, the ones still to play (white)
      connect: [false, true, true, false],
      range: {
        'min': 0,
        // Internal values are 0-based (the format shows them + 1): the last handle position is the last measure
        'max': Math.max(0, this.measureCount() - 1)
      },
      // Formatted values (format.from applies): the end handle is the last measure played, inclusive
      start: [
        this.playConfiguration.scoreRange[0],
        this.playConfiguration.currentStave,
        this.playConfiguration.scoreRange[1] - 1
      ]
    };
    return sliderConfig;
  }

  debugPlayConfiguration(step: string) {
    console.log(step, this.playConfiguration.scoreRange[0], this.playConfiguration.currentStave, this.playConfiguration.scoreRange[1]);
  }




  checkIfScrollNeeded(): void {
    // Early return si les éléments ne sont pas disponibles
    if (!this.title || !this.titleContainer || !this.titleText) {
      this.shouldScroll = false;
      return;
    }

    // Utiliser requestAnimationFrame pour optimiser le calcul de layout
    requestAnimationFrame(() => {
      // Double check après l'async callback
      if (!this.titleContainer || !this.titleText) {
        return;
      }

      try {
        const containerWidth = this.titleContainer.nativeElement.clientWidth;
        const textWidth = this.titleText.nativeElement.scrollWidth;

        // Si le texte est plus large que le conteneur (avec une marge de 10px), activer le scroll
        const needsScroll = textWidth > (containerWidth - 10);

        if (needsScroll) {
          // Calculer la distance exacte à faire défiler
          const scrollDistance = textWidth - containerWidth + 20; // +20px de marge
          const scrollPercentage = (scrollDistance / textWidth) * 100;

          // Définir la variable CSS custom pour la distance de scroll
          this.titleText.nativeElement.style.setProperty('--scroll-distance', `-${scrollPercentage}%`);
        } else {
          this.titleText.nativeElement.style.removeProperty('--scroll-distance');
        }

        // Seulement mettre à jour si l'état a changé
        if (this.shouldScroll !== needsScroll) {
          this.shouldScroll = needsScroll;
          this.changeDetector.markForCheck();
        }
      } catch (error) {
        // En cas d'erreur, on utilise la méthode de fallback
        const needsScroll = this.title.length > 25;
        if (this.shouldScroll !== needsScroll) {
          this.shouldScroll = needsScroll;
          if (needsScroll && this.titleText?.nativeElement) {
            this.titleText.nativeElement.style.setProperty('--scroll-distance', '-50%');
          }
          this.changeDetector.markForCheck();
        }
      }
    });
  }

  updatePageTitle() {
    if (!this.scoreData) {
      return;
    }

    const author = this.scoreData.author || '';
    const title = this.scoreData.title || this.title || '';

    // The practice routes are noindex (see app.routes.ts); this is only here so
    // the browser tab and bookmarks name the piece being played.
    this.seo.update({ title: [author, title].filter(Boolean).join(' - ') || undefined });
  }


  ngOnDestroy() {
    this.playerControl.unregister(this.controlHandle);
    // The stored exercise goes with the workbench that loaded it; one written for the next workbench stays (#413)
    if (isPlatformBrowser(this.platformId)
      && shouldClearStoredExercise(this.loadedExerciseInfo, localStorage.getItem(EXERCICE_INFO_KEY))) {
      localStorage.removeItem(MIDI_STORAGE_KEY);
      localStorage.removeItem(MUSIC_XML_STORAGE_KEY);
      localStorage.removeItem(EXERCICE_INFO_KEY);
    }
    this.routeParamSubscription?.unsubscribe();
    this.routeParamSubscription = undefined;
    if (this.midiPermission) {
      this.midiPermission.onchange = null;
    }
    // Clean up slider
    if (this.slider) {
      try {
        this.slider.destroy();
      } catch (error) {
        console.warn('Error destroying slider:', error);
      }
      this.slider = null;
    }
    clearTimeout(this.titleTimer);
    this.titleTimer = undefined;
    clearTimeout(this.arenaFlashTimer);
    this.playerService.releaseScoreSession();
    this.clearData();
    // Remove resize listener
    if (isPlatformBrowser(this.platformId)) {
      try {
        window.removeEventListener('resize', this.handleResize);
      } catch (e) { }
    }
  }

  clearData() {
    this.musicXml = null;
    this.midi = null;
    this.scoreData = null;
  }

}
