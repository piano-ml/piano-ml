import { Component, OnInit, ViewChild, ChangeDetectorRef, ViewEncapsulation, AfterViewInit, ElementRef, ChangeDetectionStrategy, OnDestroy, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { bootstrapHouse, bootstrapSkipBackwardFill, bootstrapPlayFill, bootstrapPauseFill, bootstrapRepeat,  bootstrapInfoCircle } from '@ng-icons/bootstrap-icons';
import { ScoreApiInfo, ScoreService } from '../../../core/api';
import { OsmdComponent } from '../osmd/osmd.component';
//import { NouisliderComponent, NouisliderModule } from 'ng2-nouislider';
import { FormsModule } from '@angular/forms';
import { KeyboardComponent } from '../keyboard/keyboard.component';
import { PlayerService } from '../../service/player.service';
import * as Midi from '@tonejs/midi';
import { MIDI_STORAGE_KEY, PlayConfiguration } from '../../model/model';
import noUiSlider, { PipsMode } from 'nouislider';
import wNumb from 'wnumb';
import { Subscription } from 'rxjs';
import { debounceTime } from 'rxjs/operators';

@Component({
  selector: 'app-workbench',
  imports: [CommonModule, FormsModule, NgIcon, OsmdComponent, KeyboardComponent,],
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
      bootstrapInfoCircle
    })
  ]
})

export class WorkbenchComponent implements AfterViewInit, OnDestroy {

  // Score data from state
  scoreData: ScoreApiInfo | null = null;
  loading = false;
  isPlaying = false;
  tempo = 120;
  title = '';
  maxStaveCount = 100; // Placeholder, should be set based on actual score data

  // Cache for parsed MIDI data
  private cachedMidi: Midi.Midi | null = null;
  private subscriptions: Subscription[] = [];
  
  // MusicXML content to pass to osmd component
  musicXml: string | null = null;
  
  // Observable for elapsed time from PlayerService
  elapsedTime!: any;

  // Reusable decoder and config cache
  private static readonly textDecoder = new TextDecoder();
  private sliderConfigCache: any = null;

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

  // Modal
  isModalOpen = false;
  modalTitle = '';
  modalContent = '';

  scoreRange = [0, 10, 80];

  @ViewChild('range') range!: ElementRef<HTMLDivElement>;
  @ViewChild('titleContainer', { static: false }) titleContainer!: ElementRef<HTMLDivElement>;
  @ViewChild('titleText', { static: false }) titleText!: ElementRef<HTMLDivElement>;
  slider: any;
  error: string | null = null;
  shouldScroll = false;

  constructor(
    private router: Router,
    private playerService: PlayerService,
    private changeDetector: ChangeDetectorRef,
    private scoreService: ScoreService
  ) {
    // Initialize elapsed time observable
    this.elapsedTime = this.playerService.elapsedTime;
    
    // Watch for message signal effects
    effect(() => {
      const message = this.playerService.message();
      if (message === "END") {
        this.isPlaying = false;
        this.changeDetector.detectChanges();
      } else if (message === "BAD") {
        this.arenaClass = 'bad';
        this.changeDetector.detectChanges();
        // Remove the bad class after a short duration
        setTimeout(() => {
          this.arenaClass = '';
          this.changeDetector.detectChanges();
        }, 500);
      }
    });
    
    const navigation = this.router.getCurrentNavigation();
    if (navigation?.extras.state) {
      this.scoreData = navigation.extras.state['score'] as ScoreApiInfo;
    } else {
      const state = window.history.state;
      if (state && state.score) {
        this.scoreData = state.score as ScoreApiInfo;
      }
    }
    if (!this.scoreData) {
      // in that case we come from excercice (scale & agility) and we have data in local storage
    }
  }

  async ngAfterViewInit() {
    if (this.scoreData) {
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
    } 

    // starting from here we always have score data in local storage and the view is loaded
    const midi = this.getCachedMidi();
    this.tempo = Math.round(this.scoreData?.tempo || midi.header.tempos[0]?.bpm || 120);
    this.title = this.scoreData?.title || midi.header.name || '';
    this.checkIfScrollNeeded();
    this.playConfiguration = this.playerService.preconfigurePlayConfiguration(this.scoreData!, this.playConfiguration, midi);
    this.setupSlider();
    this.setupSubscription();
  }



  private getCachedMidi(): Midi.Midi {
    if (!this.cachedMidi) {
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
    }
    return this.cachedMidi;
  }

  async loadMidi(scoreData: ScoreApiInfo): Promise<void> {
    return this.loadScoreData(scoreData, 'midi', async (data) => {
      const arrayBuffer = await data.arrayBuffer();
      const midi = new Midi.Midi(arrayBuffer);
      if (!(scoreData.study_tracks && scoreData.study_tracks.length > 0)) {
        midi.tracks = midi.tracks.filter(track => track.notes.length > 0);
      }
      localStorage.setItem(MIDI_STORAGE_KEY, JSON.stringify(midi.toJSON()));
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
    if (error.status === 404) {
      this.router.navigate(['/open', scoreData.id, 'info']);
    }
    reject(error);
  }

  summary() {
    this.router.navigate(['/summary']);
  }

  showInfo() {
    if (this.scoreData?.id) {
      this.router.navigate(['/open', this.scoreData.id, 'info']);
    }
  }

  reset() {
    this.setSliderState(true);
    if (this.playConfiguration.currentStave === this.playConfiguration.scoreRange[0]) {
      this.playConfiguration.scoreRange[0] = 0;
      this.playConfiguration.scoreRange[1] = this.playConfiguration.maxStaveCount +1;
    }
    this.playConfiguration.currentStave = this.playConfiguration.scoreRange[0];
    this.playerService.reset(this.playConfiguration);
    this.isPlaying = false;

    // Invalidate config cache since values changed
    this.sliderConfigCache = null;
    this.updateSlider();
  }

  setSpeed(speed: number) {
    this.playConfiguration.delayFactor = 1 / speed;
    this.playerService.reset(this.playConfiguration);
  }

  start() {
    this.isPlaying = true;
    this.playerService.play(this.playConfiguration);
    this.setSliderState(false);
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

  setupSubscription() {
    const measureSub = this.playerService.measure
      .pipe(debounceTime(16)) // ~60fps limit
      .subscribe((measure) => {
        this.playConfiguration.currentStave = measure + 1;
        this.updateSlider();
        this.changeDetector.detectChanges();
      });

    this.subscriptions.push(measureSub);
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

        // Invalidate slider config cache
        this.sliderConfigCache = null;

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

    // Early return on first difference
    for (let i = 0; i < a.length; i++) {
      if (Number(a[i]) !== Number(b[i])) return false;
    }
    return true;
  }

  formatElapsedTime(timeInMs: number | null): string {
    if (!timeInMs) return '00:00';
    
    const totalSeconds = Math.floor(timeInMs / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    
    if (hours > 0) {
      return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }

  checkIfScrollNeeded(): void {
    // Attendre que les éléments soient disponibles et que le titre soit défini
    if (!this.title || !this.titleContainer || !this.titleText) {
      this.shouldScroll = false;
      return;
    }

    // Attendre le prochain cycle de détection des changements pour que le DOM soit mis à jour
    setTimeout(() => {
      try {
        const containerWidth = this.titleContainer.nativeElement.clientWidth;
        const textWidth = this.titleText.nativeElement.scrollWidth;
        
        // Si le texte est plus large que le conteneur (avec une marge de 10px), activer le scroll
        if (textWidth > (containerWidth - 10)) {
          this.shouldScroll = true;
          
          // Calculer la distance exacte à faire défiler
          // On veut que la fin du texte soit visible, donc on défile de (textWidth - containerWidth)
          const scrollDistance = textWidth - containerWidth + 20; // +20px de marge
          const scrollPercentage = (scrollDistance / textWidth) * 100;
          
          // Définir la variable CSS custom pour la distance de scroll
          this.titleText.nativeElement.style.setProperty('--scroll-distance', `-${scrollPercentage}%`);
        } else {
          this.shouldScroll = false;
        }
        
        this.changeDetector.detectChanges();
      } catch (error) {
        // En cas d'erreur, on utilise la méthode de fallback
        this.shouldScroll = this.title.length > 25;
        if (this.shouldScroll && this.titleText?.nativeElement) {
          this.titleText.nativeElement.style.setProperty('--scroll-distance', '-50%');
        }
      }
    }, 0);
  }

  shouldScrollTitle(): boolean {
    return this.shouldScroll;
  }

  ngOnDestroy() {
    // Clean up subscriptions
    this.subscriptions.forEach(sub => {
      if (sub && !sub.closed) {
        sub.unsubscribe();
      }
    });
    this.subscriptions.length = 0;

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
