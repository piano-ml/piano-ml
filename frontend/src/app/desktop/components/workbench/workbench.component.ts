import { Component, ViewChild, ChangeDetectorRef, ViewEncapsulation, AfterViewInit, ElementRef, ChangeDetectionStrategy, OnDestroy, effect, PLATFORM_ID, inject } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { Title } from '@angular/platform-browser';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { bootstrapHouse, bootstrapSkipBackwardFill, bootstrapPlayFill, bootstrapPauseFill, bootstrapRepeat, bootstrapInfoCircleFill, bootstrapFullscreen, bootstrapFullscreenExit } from '@ng-icons/bootstrap-icons';
import { keyboard, lefthand, righthand } from '../../../shared/icons/custom-icons';
import { ScoreApiInfo, ScoreService, ScorePlayStatsPostRequest } from '../../../core/api';
import { OsmdComponent } from '../osmd/osmd.component';
import { FormsModule } from '@angular/forms';
import { KeyboardComponent } from '../keyboard/keyboard.component';
import { MidiSetupComponent } from '../midi-setup/midi-setup.component';
import { PlayerService } from '../../service/player.service';
import * as Midi from '@tonejs/midi';
import { MIDI_STORAGE_KEY, MUSIC_XML_STORAGE_KEY, PlayConfiguration } from '../../model/model';
import noUiSlider, { PipsMode } from 'nouislider';
import wNumb from 'wnumb';
import { ElapsedTimePipe } from '../../../shared/pipes/elapsed-time.pipe';
import { scales as theoryScales } from '../../service/music-theory';
import { exercises as scaleExercises } from '../../../exercises/scales/pattern';
import { saveExerciseToStorage } from '../../../exercises/exercices';



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

export class WorkbenchComponent implements AfterViewInit, OnDestroy {

  private platformId = inject(PLATFORM_ID);
  private readonly hideKeyboardStorageKey = 'hideKeyboard';
  private readonly waitForLeftHandStorageKey = 'waitForLeftHand';
  private readonly waitForRightHandStorageKey = 'waitForRightHand';
  // Score data from state
  scoreData: ScoreApiInfo | null = null;
  fromStorage = false;
  loading = false;
  isPlaying = false;
  tempo = 120;
  title = '';
  maxStaveCount = 100; // Placeholder, should be set based on actual score data

  // Cache for parsed MIDI data
  private cachedMidi: Midi.Midi | null = null;

  // MusicXML content to pass to osmd component
  musicXml: string | null = null;

  // Observable for elapsed time from PlayerService
  elapsedTime!: any;

  // Reusable decoder and config cache
  private static readonly textDecoder = new TextDecoder();
  private sliderConfigCache: any = null;
  storedHideKeyboard: boolean = false;

  /**
   * Invalidate slider configuration cache when values change
   */
  private invalidateSliderCache(): void {
    this.sliderConfigCache = null;
  }

  // Configuration
  playConfiguration: PlayConfiguration = {
    maxStaveCount: 100,
    currentStave: 1,
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

  constructor(
    private router: Router,
    private route: ActivatedRoute,
    private playerService: PlayerService,
    private changeDetector: ChangeDetectorRef,
    private scoreService: ScoreService,
    private titleService: Title
  ) {
    // Initialize elapsed time observable
    this.elapsedTime = this.playerService.elapsedTime;

    if (isPlatformBrowser(this.platformId)) {
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
    }

    // Watch for message signal effects
    effect(() => {
      const message = this.playerService.message();
      if (message === "END") {
        this.isPlaying = false;
        this.changeDetector.markForCheck();

        // POST user stats when ending play
        if (this.scoreData?.id && this.scoreData.id !== 'exercise') {
          const request: ScorePlayStatsPostRequest = {
            id: this.scoreData.id,
            assessment: {
              start: this.playConfiguration.scoreRange[0],
              end: this.playConfiguration.scoreRange[1],
              bad: this.playerService.getAssess().liveStatus.badCount,
              late: this.playerService.getAssess().liveStatus.late,
              total: this.playerService.getAssess().liveStatus.total
            }
          };
          this.scoreService.scorePlayStatsPost(request).subscribe({
            next: () => { },
            error: (error) => console.warn('Failed to register play stats:', error)
          });
        }
      } else if (message === "BAD") {
        this.arenaClass = 'bad';
        this.hideKeyboard = false;
        this.changeDetector.markForCheck();
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
          this.changeDetector.markForCheck();
          this.hideKeyboard = this.storedHideKeyboard;
        }, 5000);
      }
      // Don't mark for check if message is irrelevant
    });

    // Watch for measure signal changes
    effect(() => {
      const measure = this.playerService.measure();
      const newStave = measure + 1;

      // Only update if value actually changed
      if (this.playConfiguration.currentStave !== newStave) {
        this.playConfiguration.currentStave = newStave;
        this.updateSlider();
        this.changeDetector.markForCheck();
      }
    });

    const navigation = this.router.getCurrentNavigation();
    if (navigation?.extras.state) {
      this.scoreData = navigation.extras.state['score'] as ScoreApiInfo;
      this.fromStorage = navigation.extras.state['fromStorage'] === true;
    } else if (isPlatformBrowser(this.platformId)) {
      const state = window.history.state;
      if (state && state.score) {
        this.scoreData = state.score as ScoreApiInfo;
      }
      if (state && state.fromStorage === true) {
        this.fromStorage = true;
      }
    }

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

      if (foundScale && foundExercise) {
        saveExerciseToStorage(foundExercise, foundScale, selectedKey);
        this.fromStorage = true;
      }
    }

    if (!this.scoreData && this.fromStorage) {
      // in that case we come from exercice (scale & agility) and we have data in local storage
      // Create a minimal scoreData object for exercise mode with title from MIDI
      let exerciseTitle = 'Exercise';
      if (isPlatformBrowser(this.platformId)) {
        try {
          const midiScore = localStorage.getItem(MIDI_STORAGE_KEY);
          if (midiScore) {
            const midiJson = JSON.parse(midiScore);
            exerciseTitle = midiJson.header?.name || 'Exercise';
          }
        } catch (error) {
          console.warn('Failed to load MIDI title from localStorage:', error);
        }
      }

      this.scoreData = {
        id: 'exercise',
        title: exerciseTitle,
        owner_id: 'local'
      } as ScoreApiInfo;

      // Enable loop/repeat for exercises
      this.playConfiguration.isLoop = true;
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

  async ngAfterViewInit() {
    if (this.scoreData && !this.fromStorage) {
      // Load score data from API
      this.title = this.scoreData.title || "";
      this.checkIfScrollNeeded();
      this.loading = true;
      this.changeDetector.detectChanges(); // Trigger change detection for loading state

      try {
        await Promise.all([
          this.loadMidi(this.scoreData),
          this.loadMusicXML(this.scoreData)
        ]);

        // Use requestAnimationFrame for better performance than setTimeout
        requestAnimationFrame(() => {
          this.loading = false;
          this.changeDetector.detectChanges();
        });
      } catch (error) {
        console.error('Error loading score data:', error);
        this.loading = false;
        this.changeDetector.detectChanges();
        return;
      }
    } else if (this.fromStorage) {
      // Load from localStorage (for exercises)
      this.loading = true;
      this.changeDetector.detectChanges();

      try {
        await this.loadFromLocalStorage();

        requestAnimationFrame(() => {
          this.loading = false;
          this.changeDetector.detectChanges();
        });
      } catch (error) {
        console.error('Error loading from localStorage:', error);
        this.loading = false;
        this.changeDetector.detectChanges();
        return;
      }
    }

    // starting from here we always have score data in local storage and the view is loaded
    const midi = this.getCachedMidi();
    this.tempo = Math.round(this.scoreData?.tempo || midi.header.tempos[0]?.bpm || 120);
    this.title = this.scoreData?.title || midi.header.name || '';
    this.updatePageTitle();
    this.checkIfScrollNeeded();
    this.playConfiguration = this.playerService.preconfigurePlayConfiguration(this.scoreData!, this.playConfiguration, midi);
    this.setupSlider();
    this.playerService
  }



  private getCachedMidi(): Midi.Midi {
    if (!this.cachedMidi) {
      if (isPlatformBrowser(this.platformId)) {
        try {
          const midiScore = localStorage.getItem(MIDI_STORAGE_KEY);
          if (midiScore) {
            this.cachedMidi = new Midi.Midi();
            this.cachedMidi.fromJSON(JSON.parse(midiScore));
          } else {
            this.cachedMidi = new Midi.Midi();
          }
        } catch (error) {
          console.warn('Failed to load MIDI from localStorage:', error);
          this.cachedMidi = new Midi.Midi();
        }
      } else {
        this.cachedMidi = new Midi.Midi();
      }
    }
    return this.cachedMidi;
  }

  async loadFromLocalStorage(): Promise<void> {
    if (!isPlatformBrowser(this.platformId)) {
      throw new Error('localStorage not available on server');
    }
    // Load MusicXML from localStorage
    const musicXmlData = localStorage.getItem(MUSIC_XML_STORAGE_KEY);
    if (!musicXmlData) {
      throw new Error('No MusicXML found in localStorage');
    }
    this.musicXml = musicXmlData;

    // Invalidate MIDI cache and verify it exists
    this.cachedMidi = null;

    if (!localStorage.getItem(MIDI_STORAGE_KEY)) {
      throw new Error('No MIDI found in localStorage');
    }
  }

  async loadMidi(scoreData: ScoreApiInfo): Promise<void> {
    return this.loadScoreData(scoreData, 'midi', async (data) => {
      const arrayBuffer = await data.arrayBuffer();
      const midi = new Midi.Midi(arrayBuffer);
      if (!(scoreData.study_tracks && scoreData.study_tracks.length > 0)) {
        midi.tracks = midi.tracks.filter(track => track.notes.length > 0);
      }
      if (isPlatformBrowser(this.platformId)) {
        localStorage.setItem(MIDI_STORAGE_KEY, JSON.stringify(midi.toJSON()));
      }
      // Invalidate cache when new MIDI is loaded
      this.cachedMidi = null;
    });
  }

  async loadMusicXML(scoreData: ScoreApiInfo): Promise<void> {
    return this.loadScoreData(scoreData, 'musicxml', async (data) => {
      const arrayBuffer = await data.arrayBuffer();
      const xmlText = WorkbenchComponent.textDecoder.decode(arrayBuffer);
      this.musicXml = xmlText;
    });
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
        error: (error) => this.handleLoadError(error, scoreData, reject)
      });
    });
  }

  private handleLoadError(error: any, scoreData: ScoreApiInfo, reject: (reason?: any) => void): void {
    console.log("workbench handleLoadError:", error)
    if (error.status === 404) {
      const slug = scoreData.immutableSlug || scoreData.mutableSlug;
      if (slug) {
        this.router.navigate(['/score', slug]);
      } else if (scoreData.id) {
        this.scoreService.scoreIdGet(scoreData.id).subscribe({
          next: (fullScore) => {
            const fallbackSlug = fullScore.immutableSlug || fullScore.mutableSlug;
            if (fallbackSlug) {
              this.router.navigate(['/score', fallbackSlug]);
            } else {
              this.router.navigate(['/library']);
            }
          },
          error: (e) => {
            console.log("Acting navigate 2 to /library cause error", e);
            this.router.navigate(['/library'])
          }
        });
      } else {
        this.router.navigate(['/library']);
      }
    }
    reject(error);
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

    this.invalidateSliderCache();
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
        //values: 2, //this.maxStaveCount,
        density: -1
      },
      step: 1,
      format: wNumb({
        decimals: 0
      }),

    });

    this.slider.on('end', (values: (string | number)[]) => {
      // Convert once and reuse
      const numValues = values.map(v => Number(v));
      const [start, current, end] = numValues;
      const currentRange = this.playConfiguration.scoreRange[0];

      // Optimized logic: avoid redundant assignments
      let newStart = start;
      let newCurrent = current;

      if (start !== currentRange) {
        newCurrent = start;
      } else if (current !== currentRange) {
        newStart = current;
      }

      // Only update if values actually changed
      if (newStart !== this.playConfiguration.scoreRange[0] ||
        newCurrent !== this.playConfiguration.currentStave ||
        end !== this.playConfiguration.scoreRange[1]) {

        this.playConfiguration.scoreRange[0] = newStart;
        this.playConfiguration.currentStave = newCurrent;
        this.playConfiguration.scoreRange[1] = end;

        this.invalidateSliderCache();
        this.updateSlider();
        this.playerService.reset(this.playConfiguration);
      }
    });
  }

  private getSliderBaseConfig() {
    // Cache the config object to avoid recreation if values haven't changed
    const currentKey = `${this.playConfiguration.scoreRange[0]}-${this.playConfiguration.scoreRange[1]}-${this.playConfiguration.currentStave}`;

    if (!this.sliderConfigCache || this.sliderConfigCache.key !== currentKey) {
      this.sliderConfigCache = {
        key: currentKey,
        config: {
          behaviour: 'unconstrained' as const,
          range: {
            'min': this.playConfiguration.scoreRange[0],
            'max': this.playConfiguration.scoreRange[1]
          },
          start: [this.playConfiguration.scoreRange[0], this.playConfiguration.currentStave, this.playConfiguration.scoreRange[1]]
        }
      };
    }

    return this.sliderConfigCache.config;
  }

  debugPlayConfiguration(step: string) {
    console.log(step, this.playConfiguration.scoreRange[0], this.playConfiguration.currentStave, this.playConfiguration.scoreRange[1]);
  }

  // Public getter for debugging loading state
  get isLoading(): boolean {
    return this.loading;
  }

  initSlider() {
    this.slider.updateOptions({
      ...this.getSliderBaseConfig(),
      pips: {
        mode: PipsMode.Count,
        values: this.maxStaveCount,
        density: -1
      }
    });
  }

  updateSlider() {
    if (!this.slider) return;

    const newValues = [this.playConfiguration.scoreRange[0], this.playConfiguration.currentStave, this.playConfiguration.scoreRange[1]];
    const currentValues = this.slider.get();

    // Only update if values have actually changed
    if (!this.arraysEqual(newValues, currentValues)) {
      this.slider.updateOptions({
        start: newValues
      });
    }
  }

  private arraysEqual(a: any[], b: any[]): boolean {
    if (a === b) return true; // Same reference
    if (!a || !b) return false; // Null/undefined check
    if (a.length !== b.length) return false;

    // Direct comparison without array conversion for better performance
    for (let i = 0; i < a.length; i++) {
      if (Number(a[i]) !== Number(b[i])) return false;
    }
    return true;
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

        // Seulement mettre à jour si l'état a changé
        if (this.shouldScroll !== needsScroll) {
          this.shouldScroll = needsScroll;

          if (needsScroll) {
            // Calculer la distance exacte à faire défiler
            const scrollDistance = textWidth - containerWidth + 20; // +20px de marge
            const scrollPercentage = (scrollDistance / textWidth) * 100;

            // Définir la variable CSS custom pour la distance de scroll
            this.titleText.nativeElement.style.setProperty('--scroll-distance', `-${scrollPercentage}%`);
          }

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
        this.titleService.setTitle(`PianoML: ${author} - ${title}`);
      } else if (title) {
        this.titleService.setTitle(`PianoML: ${title}`);
      } else {
        this.titleService.setTitle('PianoML');
      }
    }
  }

  ngOnDestroy() {
    // Clean up slider
    if (this.slider) {
      try {
        this.slider.destroy();
      } catch (error) {
        console.warn('Error destroying slider:', error);
      }
      this.slider = null;
    }

    // Clear caches
    this.cachedMidi = null;
    this.musicXml = null;
    this.sliderConfigCache = null;
  }

}
