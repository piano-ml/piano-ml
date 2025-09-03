import { Component, OnInit, ViewChild, ChangeDetectorRef, ViewEncapsulation, AfterViewInit, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { bootstrapHouse, bootstrapSkipBackwardFill, bootstrapPlayFill, bootstrapPauseFill, bootstrapRepeat } from '@ng-icons/bootstrap-icons';
import { ScoreApiInfo, ScoreService } from '../../../core/api';
import { OsmdComponent } from '../osmd/osmd.component';
//import { NouisliderComponent, NouisliderModule } from 'ng2-nouislider';
import { FormsModule } from '@angular/forms';
import { KeyboardComponent } from '../keyboard/keyboard.component';
import { PlayerService } from '../../service/player.service';
import * as Midi from '@tonejs/midi';
import { MIDI_STORAGE_KEY, MUSIC_XML_STORAGE_KEY, PlayConfiguration } from '../../model/model';
import noUiSlider, { PipsMode } from 'nouislider';
import wNumb from 'wnumb';

@Component({
  selector: 'app-workbench',
  imports: [CommonModule, FormsModule, NgIcon, OsmdComponent, KeyboardComponent,],
  templateUrl: './workbench.component.html',
  styleUrl: './workbench.component.css',
  encapsulation: ViewEncapsulation.None,
  viewProviders: [
    provideIcons({
      bootstrapHouse,
      bootstrapSkipBackwardFill,
      bootstrapPlayFill,
      bootstrapPauseFill,
      bootstrapRepeat
    })
  ]
})

export class WorkbenchComponent implements AfterViewInit {

  // Score data from state
  scoreData: ScoreApiInfo | null = null;
  loading = false;
  isPlaying = false;
  tempo = 120;
  maxStaveCount = 100; // Placeholder, should be set based on actual score data
  // Configuration
  playConfiguration: PlayConfiguration = {
    maxStaveCount: 100,
    currentStave: 1,
    doSound: true,
    waitForLeftHand: false,
    waitForRightHand: false,
    delayFactor: 1,
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
  slider: any;
  error: string | null = null;

  constructor(
    private router: Router,
    private playerService: PlayerService,
    private changeDetector: ChangeDetectorRef,
    private scoreService: ScoreService
  ) {
    const navigation = this.router.getCurrentNavigation();
    if (navigation?.extras.state) {
      this.scoreData = navigation.extras.state['score'] as ScoreApiInfo;
    } else {
      const state = window.history.state;
      if (state && state.score) {
        this.scoreData = state.score as ScoreApiInfo;
      }
    }
  }

  async ngAfterViewInit() {
    if (this.scoreData) {
      await Promise.all([
        this.loadMidi(this.scoreData),
        this.loadMusicXML(this.scoreData)
      ]);
      setTimeout(() => {
       this.loading = false;
       this.changeDetector.detectChanges();
      }, 0); 
    }
    // starting from here we always have score data in local storage and the view is loaded
    const midiScore = localStorage.getItem(MIDI_STORAGE_KEY);
    const midi = new Midi.Midi();
    midi.fromJSON(JSON.parse(midiScore!));
    this.playConfiguration = this.playerService.preconfigurePlayConfiguration(this.scoreData!, this.playConfiguration, midi);
    this.setupSlider();
    this.setupSubscription();
  }

  async loadMidi(scoreData: ScoreApiInfo): Promise<void> {
    this.loading = true;
    return new Promise((resolve, reject) => {
      this.scoreService.scoreOwnerMbidTypeVersionRevisionGet(scoreData!.owner_id!, scoreData!.mbid!, 'midi', 1, 1).subscribe({
        next: async (data) => {
          try {
            const arrayBuffer = await data.arrayBuffer();
            const midi = new Midi.Midi(arrayBuffer);
            const midiText = JSON.stringify(midi.toJSON());
            localStorage.setItem(MIDI_STORAGE_KEY, midiText);
            resolve();
          } catch (error) {
            reject(error);
          }
        },
        error: (error) => {
          reject(error);
        }
      });
    });
  }


  async loadMusicXML(scoreData: ScoreApiInfo): Promise<void> {
    return new Promise((resolve, reject) => {
      this.loading = true;
      this.scoreService.scoreOwnerMbidTypeVersionRevisionGet(scoreData!.owner_id!, scoreData!.mbid!, 'musicxml', 1, 1).subscribe({
        next: (data) => {
          data.arrayBuffer().then((arrayBuffer) => {
            const xmlText = new TextDecoder().decode(arrayBuffer);
            localStorage.setItem(MUSIC_XML_STORAGE_KEY, xmlText);
            resolve();
          });
        },
        error: (error) => {
          reject(error);
        }
      });
    });
  }

  summary() {
    this.router.navigate(['/summary']);
  }

  reset() {
    this.slider.enable();
    if (this.playConfiguration.currentStave === this.playConfiguration.scoreRange[0]) {
      this.playConfiguration.scoreRange[0] = 0;
    }
    this.playConfiguration.currentStave = this.playConfiguration.scoreRange[0];
    this.playerService.reset(this.playConfiguration);
    this.isPlaying = false;
    this.updateSlider();
  }

  setSpeed(speed: number) {
    this.playConfiguration.delayFactor = 1 / speed;
  }

  start() {
    this.isPlaying = true;    
    this.playerService.play(this.playConfiguration);
    this.slider.disable();
  }

  stop() {
    this.slider.enable();
    this.playerService.pause();
    this.isPlaying = false;
  }

  setupSubscription() {
    this.playerService.measure.subscribe((measure) => {
      this.playConfiguration.currentStave = measure +1;
      this.updateSlider();
      this.changeDetector.detectChanges();
    });
  }

  setupSlider() {
    this.slider = noUiSlider.create(this.range.nativeElement, {
      behaviour: 'unconstrained',
      range: {
        'min': this.playConfiguration.scoreRange[0],
        'max': this.playConfiguration.scoreRange[1]
      },
      start: [this.playConfiguration.scoreRange[0], this.playConfiguration.currentStave, this.playConfiguration.scoreRange[1]],
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
      if (Number(values[0]) != this.playConfiguration.scoreRange[0]) {
        // start changed we reset run
        this.playConfiguration.currentStave = Number(values[0]);
        this.playConfiguration.scoreRange[0] = Number(values[0]);
      } else if (Number(values[1]) != this.playConfiguration.currentStave) {
        // run changed we reset start
        this.playConfiguration.scoreRange[0] = Number(values[1]);
        this.playConfiguration.currentStave = Number(values[1]);
      } else if (Number(values[2]) != this.playConfiguration.scoreRange[1]) {
        this.playConfiguration.currentStave = Number(values[0]);
        this.playConfiguration.scoreRange[1] = Number(values[2]);
      }
      this.updateSlider();
      this.playerService.reset(this.playConfiguration);
    });
  }

  debugPlayConfiguration(step: string) {
    console.log(step, this.playConfiguration.scoreRange[0], this.playConfiguration.currentStave, this.playConfiguration.scoreRange[1]);
  }

  initSlider() {
    this.slider.updateOptions({
      range: {
        'min': this.playConfiguration.scoreRange[0],
        'max': this.playConfiguration.scoreRange[1]
      },
      start: [this.playConfiguration.scoreRange[0], this.playConfiguration.currentStave, this.playConfiguration.scoreRange[1]],
      pips: {
        mode: PipsMode.Count,
        values: this.maxStaveCount,
        density: -1
      }
    });
  }

  updateSlider() {
    this.slider.updateOptions({
      start: [this.playConfiguration.scoreRange[0], this.playConfiguration.currentStave, this.playConfiguration.scoreRange[1]]
    });
  }

}
