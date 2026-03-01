import { Component, ViewChild, ChangeDetectorRef, ViewEncapsulation, AfterViewInit, ElementRef, ChangeDetectionStrategy, OnDestroy, effect, PLATFORM_ID, inject, OnInit } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { Title } from '@angular/platform-browser';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { bootstrapHouse, bootstrapSkipBackwardFill, bootstrapPlayFill, bootstrapPauseFill, bootstrapRepeat, bootstrapInfoCircleFill, bootstrapFullscreen, bootstrapFullscreenExit } from '@ng-icons/bootstrap-icons';
import { keyboard, lefthand, righthand } from '../../../shared/icons/custom-icons';
import { ScoreApiInfo, ScoreService, ScorePlayStatsPostRequest } from '../../../core/api';
import { firstValueFrom, BehaviorSubject } from 'rxjs';
import { OsmdComponent } from '../osmd/osmd.component';
import { FormsModule } from '@angular/forms';
import { KeyboardComponent } from '../keyboard/keyboard.component';
import { MidiSetupComponent } from '../midi-setup/midi-setup.component';
import { PlayerService } from '../../service/player.service';
import * as Midi from '@tonejs/midi';
import { EXERCICE_INFO_KEY, MIDI_STORAGE_KEY, MUSIC_XML_STORAGE_KEY, PlayConfiguration } from '../../model/model';
import noUiSlider, { PipsMode } from 'nouislider';
import wNumb from 'wnumb';
import { ElapsedTimePipe } from '../../../shared/pipes/elapsed-time.pipe';
import { scales as theoryScales } from '../../service/music-theory';
import { exercises as scaleExercises } from '../../../exercises/scales/pattern';
import { CursorService } from '../../service/cursor.service';




@Component({
  selector: 'app-workbench',
  imports: [CommonModule, FormsModule, NgIcon, OsmdComponent, KeyboardComponent, MidiSetupComponent, ElapsedTimePipe],
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
      keyboard: keyboard.data,
      lefthand: lefthand.data,
      righthand: righthand.data
    })
  ]
})

export class WorkbenchComponent implements OnInit, OnDestroy {

  private platformId = inject(PLATFORM_ID);
  private readonly hideKeyboardStorageKey = 'hideKeyboard';
  private readonly waitForLeftHandStorageKey = 'waitForLeftHand';
  private readonly waitForRightHandStorageKey = 'waitForRightHand';
  // Score data from state
  scoreData: ScoreApiInfo | null = null;
  // Expose loading as an observable to use `async` pipe with OnPush change detection
  loading$ = new BehaviorSubject<boolean>(true);
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

  // Observable for elapsed time from PlayerService
  elapsedTime!: any;

  // Reusable decoder
  private static readonly textDecoder = new TextDecoder();

  storedHideKeyboard: boolean = false;

  // Loading feedback exposed as observable for OnPush template updates
  loadingFeedBack$ = new BehaviorSubject<{ message: string; percentage: number; } | null>(null);
  get loadingFeedBack() { return this.loadingFeedBack$.value; }


  // Configuration
  playConfiguration: PlayConfiguration = {
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
    midi: null
  };

  // UI state
  hideKeyboard = false;
  arenaClass = '';
  isFullscreen = false;
  isMidiSetupOpen = false;


  scoreRange = [0, 10, 80];

  @ViewChild('range') range!: ElementRef<HTMLDivElement>;
  @ViewChild('titleContainer', { static: false }) titleContainer!: ElementRef<HTMLDivElement>;
  @ViewChild('titleText', { static: false }) titleText!: ElementRef<HTMLDivElement>;
  slider: any;
  error: string | null = null;
  shouldScroll = false;


  constructor(
    private router: Router,
    private route: ActivatedRoute,
    private playerService: PlayerService,
    private cursorService: CursorService,
    private changeDetector: ChangeDetectorRef,
    private scoreService: ScoreService,
    private titleService: Title
  ) {


    this.setupGeneric();
  }

  setupGeneric() {
    this.loading$.next(true);
    this.loadingFeedBack$.next(null);

    // Initialize elapsed time observable
    this.elapsedTime = this.playerService.elapsedTime;

    const stored = localStorage.getItem(this.hideKeyboardStorageKey);
    if (stored !== null) {
      try {
        this.hideKeyboard = JSON.parse(stored);
      } catch {
        this.hideKeyboard = stored === 'true';
      }
    }
    this.storedHideKeyboard = this.hideKeyboard;
    const storedLeft = localStorage.getItem(this.waitForLeftHandStorageKey);
    if (storedLeft !== null) {
      try {
        this.playConfiguration.waitForLeftHand = JSON.parse(storedLeft);
      } catch {
        this.playConfiguration.waitForLeftHand = storedLeft === 'true';
      }
    }
    const storedRight = localStorage.getItem(this.waitForRightHandStorageKey);
    if (storedRight !== null) {
      try {
        this.playConfiguration.waitForRightHand = JSON.parse(storedRight);
      } catch {
        this.playConfiguration.waitForRightHand = storedRight === 'true';
      }
    }


    // Consolidated reactive effect: feedback, player messages, and measure updates
    effect(() => {
      // Feedback
      try {
        this.loadingFeedBack$.next(this.cursorService.feedbackSignal());
      } catch (e) {
        this.loadingFeedBack$.next(null);
      }

      // Player messages
      const message = this.playerService.message();
      if (message === 'END') {
        this.isPlaying = false;
        this.recordAssessment();
      } else if (message === 'BAD') {
        this.arenaClass = 'bad';
        this.hideKeyboard = false;
        setTimeout(() => {
          this.playerService.displayLiveOnKeyboard();
        }, 0);

        // Remove the bad class after a short duration
        setTimeout(() => {
          this.arenaClass = '';
          this.changeDetector.markForCheck();
        }, 500);
        setTimeout(() => {
          this.arenaClass = '';
          this.hideKeyboard = this.storedHideKeyboard;
          this.changeDetector.markForCheck();
        }, 5000);
      }

      // Measure updates
      this.playConfiguration.currentStave = this.cursorService.measure() + 1;
      this.updateSlider();

      // Single mark for check after all updates
      this.changeDetector.markForCheck();
    });
  }

  async ngOnInit(): Promise<void> {
    if (this.router.url.startsWith('/work/')) {
      this.setupWorkMode()
    } else if (this.router.url.startsWith('/workbench/scale')
      || this.router.url.startsWith('/workbench/agility')) {
      this.setupExerciseMode()
    } else if (this.router.url.startsWith('/workbench/sightreadng')) {
      this.setupSightReadingMode()
    }
  }

  async setupWorkMode() {
    const slug = this.route.snapshot.paramMap.get('slug');
    this.scoreData = await firstValueFrom(this.scoreService.scoreGetBySlug(slug!));
    this.midi = await this.downloadMidi(this.scoreData);
    this.musicXml = await this.downloadMusicXML(this.scoreData);
    this.onLoaded();
  }


  onLoaded() {
    this.tempo = Math.round(this.scoreData?.tempo || this.midi?.header.tempos[0]?.bpm || 120);
    this.playConfiguration = this.playerService.preconfigurePlayConfiguration(this.scoreData!, this.playConfiguration, this.midi!);
    this.loading$.next(false);
    this.changeDetector.markForCheck();
    console.log('Score info loaded', this.loading);
  }

  setupSightReadingMode() {
    throw new Error('Method not implemented.');
  }

  setupExerciseMode() {

    const navigation = this.router.getCurrentNavigation();

    if (navigation?.extras.state) {
      this.scoreData = navigation.extras.state['score'] as ScoreApiInfo;
    } else if (isPlatformBrowser(this.platformId)) {
      const state = window.history.state;
      if (state && state.score) {
        this.scoreData = state.score as ScoreApiInfo;
      }

    }

    //await this.loadFromLocalStorage();

    // Deep-link support for exercises: allow refreshing `/workbench/scale/...`.
    // On refresh, navigation state is lost; we reconstruct localStorage from URL params.
    const scaleKey = this.route.snapshot.paramMap.get('scaleKey');
    const selectedKey = this.route.snapshot.paramMap.get('selectedKey');
    const exerciseKey = this.route.snapshot.paramMap.get('exerciseKey');
    if (scaleKey && selectedKey && exerciseKey) {
      const foundScale = theoryScales.find((s) => this.normalizeKey(s.key ?? s.name) === this.normalizeKey(scaleKey));
      const foundExercise = scaleExercises.find(
        (e) => this.normalizeKey(e.key ?? e.title) === this.normalizeKey(exerciseKey)
      );

    }

    if (!this.scoreData) {
      // in that case we come from exercice (scale & agility) and we have data in local storage
      // Create a minimal scoreData object for exercise mode with title from MIDI
      let exerciseTitle = 'Exercise';
      let exerciseJson: any = null;
      if (isPlatformBrowser(this.platformId)) {
        try {
          const midiScore = localStorage.getItem(MIDI_STORAGE_KEY);
          if (midiScore) {
            const midiJson = JSON.parse(midiScore);
            exerciseTitle = midiJson.header?.name || 'Exercise';
          }
          const exerciceInfo = localStorage.getItem(EXERCICE_INFO_KEY);
          if (exerciceInfo) {
            exerciseJson = JSON.parse(exerciceInfo);
          }

        } catch (error) {
          console.warn('Failed to load MIDI title from localStorage:', error);
        }
      }

      this.scoreData = {
        id: 'exercise',
        title: exerciseTitle,
        owner_id: 'local',
        tonic: exerciseJson?.tonic,
        mode: exerciseJson?.mode,
        genre: exerciseJson?.kind
      } as ScoreApiInfo;

      // Enable loop/repeat for exercises
      this.playConfiguration.isLoop = true;
    }
  }





  openMidiSetup() {
    this.isMidiSetupOpen = true;
  }

  closeMidiSetup() {
    this.isMidiSetupOpen = false;
  }

  setHideKeyboard(value: boolean) {
    this.hideKeyboard = value;
    if (isPlatformBrowser(this.platformId)) {
      localStorage.setItem(this.hideKeyboardStorageKey, JSON.stringify(value));
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

  onOsmdLoadingChange(loading: boolean) {
    if (loading) {
      return;
    }
    this.osmdLoading$.next(loading);
    this.changeDetector.markForCheck();
    if (!loading) {
      this.setupSlider();
      setTimeout(() => {
        this.title = `${this.scoreData!.author} - ${this.scoreData!.title}`;
        this.updatePageTitle()
        this.changeDetector.detectChanges();
        this.checkIfScrollNeeded();
      }, 100);
    }
    // here I do not need the observables
    
  }










  async loadFromLocalStorage(): Promise<void> {

    // Load MusicXML from localStorage
    const musicXmlData = localStorage.getItem(MUSIC_XML_STORAGE_KEY);
    if (!musicXmlData) {
      throw new Error('No MusicXML found in localStorage');
    }
    this.musicXml = musicXmlData;

    if (!localStorage.getItem(MIDI_STORAGE_KEY)) {
      throw new Error('No MIDI found in localStorage');
    }

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




  private async loadScoreData(
    scoreData: ScoreApiInfo,
    type: 'midi' | 'musicxml',
    processor: (data: any) => Promise<void>
  ): Promise<void> {
    // Don't set loading here since it's managed at higher level
    return new Promise((resolve, reject) => {
      this.scoreService.scoreOwnerIdTypeVersionRevisionGet(scoreData!.owner_id!, scoreData!.id!, type, scoreData.version || 1, 1).subscribe({
        next: async (data) => {
          try {
            await processor(data);
            resolve();
          } catch (error) {
            reject(error);
          }
        },
        error: (error) => this.handleLoadError(error)
      });
    });
  }

  private handleLoadError(error: any): void {
    console.error(`Error `, error);
  }


  recordAssessment() {
    // POST user stats when ending play and playing both hands

    if (this.scoreData) {
      //if (this.scoreData && this.playConfiguration.waitForLeftHand && this.playConfiguration.waitForRightHand) {
      const request: ScorePlayStatsPostRequest = {
        id: this.scoreData.id!,
        title: this.scoreData.title,
        author: this.scoreData.author,
        tonic: this.scoreData.tonic,
        mode: this.scoreData.mode,
        played_at: new Date().toISOString(),
        genre: this.scoreData.genre,
        genre_id: this.scoreData.genre_id,
        assessment: {
          start: this.playConfiguration.scoreRange[0],
          end: this.playConfiguration.scoreRange[1],
          bad: this.playerService.getAssess().liveStatus.badCount,
          late: this.playerService.getAssess().liveStatus.late,
          total: this.playerService.getAssess().liveStatus.total,

        }
      };
      console.log('record_assessment', request);
      this.scoreService.scorePlayStatsPost(request).subscribe({
        next: (response) => { console.log(response) },
        error: (error) => console.warn('Failed to register play stats:', error)
      });
    } else {
      console.warn('No score data available to record assessment');
    }
  }

  private normalizeKey(value: string): string {
    return value
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/&/g, ' and ')
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .replace(/_{2,}/g, '_');
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
      this.playConfiguration.scoreRange[0] = 0;
      this.playConfiguration.scoreRange[1] = this.playConfiguration.maxStaveCount + 1;
    }
    this.playConfiguration.currentStave = this.playConfiguration.scoreRange[0];
    this.playerService.reset(this.playConfiguration);
    this.isPlaying = false;

    this.updateSlider();
  }

  setSpeed(speed: number) {
    this.playConfiguration.delayFactor = 1 / speed;
    this.playerService.reset(this.playConfiguration);
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

  start() {
    this.isPlaying = true;
    this.playerService.play(this.playConfiguration);
    this.setSliderState(false);
    if (this.scoreData?.id && this.scoreData.id !== 'exercise' && this.playConfiguration.scoreRange[0] === 1) {
      const request: ScorePlayStatsPostRequest = { id: this.scoreData.id };
      this.scoreService.scorePlayStatsPost(request).subscribe({
        next: () => { },
        error: (error) => console.warn('Failed to register play stats:', error)
      });
    }
  }

  stop() {
    this.setSliderState(true);
    this.playerService.pause();
    this.isPlaying = false;
  }

  private setSliderState(enabled: boolean) {
    if (enabled) {
      this.slider.enable();
    } else {
      this.slider.disable();
    }
  }

  setupSlider() {
    this.slider = noUiSlider.create(this.range.nativeElement, {
      ...this.getSliderBaseConfig(),
      pips: {
        mode: PipsMode.Steps,
        density: 100,
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
      // Convert once and reuse
      const numValues = values.map(v => Math.round(Number(v)));
      let [start, current, end] = numValues;
      let [oldStart, oldCurrent, oldEnd] = [
        this.playConfiguration.scoreRange[0],
        this.playConfiguration.currentStave,
        this.playConfiguration.scoreRange[1]
      ];
      // detect what changed
      if (current != oldCurrent) {
        if (current === end) {
          current--;
        }
        start = current;
      } else if (start != oldStart) {
        if (start === end) {
          start--;
        }
        current = start;
      } else if (end != oldEnd) {
        if (end === start) {
          end++;
        }

        current = start;
      }

      this.playConfiguration.scoreRange[0] = Math.round(start);
      this.playConfiguration.currentStave = Math.round(current);
      this.playConfiguration.scoreRange[1] = Math.round(end);
      this.playerService.reset(this.playConfiguration);

      this.updateSlider();
    });
  }

  updateSlider() {
    if (!this.slider) return;
    const newValues = [
      this.playConfiguration.scoreRange[0],
      this.playConfiguration.currentStave,
      this.playConfiguration.scoreRange[1]
    ];
    this.slider.updateOptions({
      start: newValues,
      tooltips: [
        false,
        false,
        false
      ],
    });
  }


  private getSliderBaseConfig() {
    const sliderConfig = {
      behaviour: 'unconstrained' as const,
      range: {
        'min': 0,
        'max': this.cursorService.osmdMeasureCount + 1
      },
      start: [
        this.playConfiguration.scoreRange[0],
        this.playConfiguration.currentStave,
        this.playConfiguration.scoreRange[1] + 1
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
    if (this.scoreData) {
      const author = this.scoreData.author || '';
      const title = this.scoreData.title || this.title || '';

      if (author && title) {
        this.titleService.setTitle(`${author} - ${title}`);
      } else if (title) {
        this.titleService.setTitle(`${title}`);
      } else {
        this.titleService.setTitle('PianoML: Play and Learn Piano');
      }
    }
  }


  ngOnDestroy() {
    localStorage.removeItem(MIDI_STORAGE_KEY);
    localStorage.removeItem(MUSIC_XML_STORAGE_KEY);
    localStorage.removeItem(EXERCICE_INFO_KEY);
    // Clean up slider
    if (this.slider) {
      try {
        this.slider.destroy();
      } catch (error) {
        console.warn('Error destroying slider:', error);
      }
      this.slider = null;
    }
    this.clearData();
  }

  clearData() {
    this.musicXml = null;
    this.midi = null;
    this.scoreData = null;
  }

}
