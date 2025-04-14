// biome-ignore lint/style/useImportType: <explanation>
import { AfterViewInit, ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit, ViewChild, ViewEncapsulation } from '@angular/core';
import { KeyboardComponent } from "../keyboard/keyboard.component";
// biome-ignore lint/style/useImportType: <explanation>
import { ScoreStateService } from '../../service/score-state.service';
import { CommonModule } from '@angular/common';
import { AnimatedScoreComponent } from '../animated-score/animated-score.component';
// biome-ignore lint/style/useImportType: <explanation>
import { Router } from '@angular/router';
import * as Midi from '@tonejs/midi';
// biome-ignore lint/style/useImportType: <explanation>
import { EngravingService } from '../../service/engraving.service';
// biome-ignore lint/style/useImportType: <explanation>
import { Subscription } from 'rxjs';
// biome-ignore lint/style/useImportType: <explanation>
import { NouisliderComponent, NouisliderModule } from 'ng2-nouislider';
import { FormsModule } from '@angular/forms';
import type { PlayConfiguration } from '../../model/model';
import { ModalComponent } from '../modal/modal.component';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { bootstrapRepeat, bootstrapSkipBackwardFill, bootstrapPlayFill, bootstrapPauseFill, bootstrapHouse } from '@ng-icons/bootstrap-icons';
import type { MidiStateEvent } from '../../../shared/model/webmidi';
// biome-ignore lint/style/useImportType: <explanation>
import { MidiServiceService } from '../../../shared/services/midi-service.service';
import { Md5 } from 'ts-md5';

export interface UserPerformance {
  badNoteCount: number;
  runCount: number;
  tooEarlyCount: number;
  tooLateCount: number;
  perfectNoteCount: number;
  goodNoteCount: number;
}

@Component({
  selector: 'app-desktop',
  templateUrl: './desktop.component.html',
  styleUrl: './desktop.component.css',
  imports: [AnimatedScoreComponent, KeyboardComponent, CommonModule, NouisliderModule, FormsModule, ModalComponent, NgIcon],
  encapsulation: ViewEncapsulation.None,
  viewProviders: [provideIcons({ bootstrapRepeat, bootstrapSkipBackwardFill, bootstrapPauseFill, bootstrapPlayFill, bootstrapHouse })],
  //changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DesktopComponent implements OnDestroy, AfterViewInit, OnInit {

  isReady = false;
  isPlaying = false;
  tempo = 0;
  tempoFactor = 0;
  title = "";
  subscriptions: Subscription[] = [];
  scoreRange = [0, 100];
  isTheEnd = false;
  measure = 0;
  maxStaveCount = 10000;
  playConfiguration = {
    doSound: true,
    waitForLeftHand: false,
    waitForRightHand: false,
    delayFactor: 1,
    scoreRange: [0, 100],
    isLoop: false,
  } as PlayConfiguration
  performance: UserPerformance = {
    badNoteCount: 0,
    runCount: 0,
    tooEarlyCount: 0,
    tooLateCount: 0,
    perfectNoteCount: 0,
    goodNoteCount: 0,
  };
  heightClass = ""

  @ViewChild('sliderRef') sliderRef!: NouisliderComponent;

  arenaClass = ''

  hash!: string;

  isModalOpen = false;
  modalTitle = '';
  modalContent = '';
  fingering: number[][][] = [];
  midiFnHandler!: (e: MidiStateEvent) => void;
  showPianoman = false;
  hideKeyboard = true;


  constructor(
    private scoreStateService: ScoreStateService,
    private engravingService: EngravingService,
    private router: Router,
    private ref: ChangeDetectorRef,
    private midiService: MidiServiceService
  ) {
    const state = this.router.getCurrentNavigation()?.extras.state;
    if (window.innerWidth < 1024 || window.innerHeight < 768) {
      // error screen resolution to low
      this.modalTitle = "Error";
      this.modalContent = "Screen resolution too low, please consider using a minimum of 1024x768 pixels screen in portrait mode";
      this.isModalOpen = true;
    }
    if (state) {
      this.modalTitle = state['title'];

      this.modalContent = state['advice'];
      if (this.modalContent) {
        this.isModalOpen = true;
      }

      this.playConfiguration.isLoop = !!state['loop'];

      if (state['hands'] === 2) { this.playConfiguration.waitForLeftHand = true; }
      this.playConfiguration.waitForRightHand = true;

      this.fingering = [
        state['rightHandFingering']?.filter((f: number[]) => f !== undefined) || [],
        state['leftHandFingering']?.filter((f: number[]) => f !== undefined) || []
      ];
      this.showPianoman = true
    }
    this.heightClass = `h-[${this.engravingService.height + 100}px]`
  }

  ngOnInit(): void {
    const score = localStorage.getItem("score");
    this.hash = Md5.hashStr(score || '')
    const midiJson = score ? JSON.parse(score) as Midi.MidiJSON : null;
    if (midiJson) {
      const splitVoices: boolean = JSON.parse(localStorage.getItem("splitVoices") || 'false') === true;
      const twoMidi = this.splitMidi(midiJson);
      this.engravingService.setupMidiScore(twoMidi.study, splitVoices, this.fingering);
      this.scoreStateService.midiOther = twoMidi.other;
      this.title = twoMidi.study.name.trim().substring(0, 21);
    } else {
      this.router.navigate(['/open']);
    }
  }


  ngAfterViewInit(): void {
    setTimeout(() => {
      this.setupSubscriptions();
    }, 0);
  }

  setupSubscriptions() {

    this.subscriptions.push(
      this.scoreStateService.message.subscribe((msg: string) => {

        switch (msg) {
          case "END":
            this.scoreStateService.reset(this.playConfiguration);
            if (this.playConfiguration.isLoop) {
              if (this.playConfiguration.waitForLeftHand) {
                this.performance.runCount++;
                this.performance.runCount++;
              }
              if (this.playConfiguration.waitForRightHand) {
                this.performance.runCount++;
              }
              setTimeout(() => {
                this.start();
              }, 0);
            } else {
              this.isPlaying = false;

            }
            break;
          case "LATE":
            this.performance.tooLateCount++;
            break;
          case "BAD":
            this.brieflyShowKeyboardIfOpportunate();
            this.performance.badNoteCount++;
            this.arenaClass = "bad"
            setTimeout(() => {
              this.arenaClass = ""
            }, 500)
            break;
          case "GOOD":
            this.performance.goodNoteCount++;
            break;
          case "PERFECT":
            this.performance.perfectNoteCount++;
            break;
        }
        this.ref.detectChanges();
      }))



    this.subscriptions.push(this.engravingService.ready.subscribe((x: boolean) => {
      this.isReady = x;
      if (this.isReady) {
        this.onScoreReady();
      }
    }));


    this.subscriptions.push(this.scoreStateService.measure.subscribe((x: number) => {
      if (!this.sliderRef?.slider) return;
      //this.scoreRange[0] = x;

      this.sliderRef.slider.updateOptions({
        start: [x, this.scoreRange[1]],
      });
      this.ref.detectChanges();
      //}
    }));


    this.subscriptions.push(this.sliderRef.end.subscribe((values: number[]) => {
      if (!this.isPlaying) {
        this.playConfiguration.isLoop = true;
        if (values[0] === values[1]) {
          console.warn("invalid score range set", values)
          this.playConfiguration.scoreRange = [0, this.maxStaveCount]
        }
        this.playConfiguration.scoreRange = [values[0], values[1]];
        this.scoreStateService.reset(this.playConfiguration);
      }

    }));
  }

  splitMidi(json: Midi.MidiJSON): { study: Midi.Midi, other: Midi.Midi } {
    const midiAll = new Midi.Midi();
    midiAll.fromJSON(json)
    if (midiAll.header.timeSignatures.length === 0) {
      midiAll.header.timeSignatures.push({ ticks: 0, timeSignature: [4, 4] });
    }

    const midiStudied = midiAll.clone();
    const midiOther = midiAll.clone();

    const studies: number[] = JSON.parse(localStorage.getItem("studies") || '[]');
    const midiStudiedTracks = midiAll.tracks.filter((track, idx) => {
      return studies?.indexOf(idx) !== -1;
    });
    midiStudied.tracks = midiStudiedTracks;

    const midiOtherTracks = midiAll.tracks.filter((track, idx) => {
      return studies?.indexOf(idx) === -1;
    });
    midiOther.tracks = midiOtherTracks
    return { study: midiStudied, other: midiOther };
  }

  onScoreReady() {
    this.tempo = Math.round(this.engravingService.tempo);
    this.maxStaveCount = this.engravingService.staveAndStaveNotesPair.length;
    if (this.maxStaveCount === 0) {
      console.warn("empty file may cause infinite loop")
      this.summary()
      return;
    }
    this.scoreRange[0] = 0;
    this.scoreRange[1] = this.maxStaveCount;
    this.playConfiguration.scoreRange[0] = 0;
    this.playConfiguration.scoreRange[1] = this.maxStaveCount;
    this.playConfiguration.staveAndStaveNotesPair = this.engravingService.staveAndStaveNotesPair;
    this.playConfiguration.timeSignature = this.engravingService.getTimeSignature(0); // TODO this is a limitation
    this.playConfiguration.staveWidth = this.engravingService.stave_width;
    this.playConfiguration.midiHeader = this.engravingService.midiObj?.header
    this.scoreStateService.reset(this.playConfiguration)
    this.ref.detectChanges();
  }

  setSpeed(speed: number) {
    this.playConfiguration.delayFactor = 1 / speed;
  }

  start() {
    this.isPlaying = true;
    this.playConfiguration.tempo = this.tempo;
    this.playConfiguration.staveAndStaveNotesPair = this.engravingService.staveAndStaveNotesPair; // TODO CHECK 
    this.scoreStateService.play(this.playConfiguration);
  }


  stop() {
    this.isPlaying = false;
    this.scoreStateService.pause();
    this.ref.detectChanges();
  }

  reset() {
    if (this.playConfiguration.scoreRange[0] === this.scoreRange[0]) {
      this.playConfiguration.scoreRange[0] = 0;
      this.playConfiguration.scoreRange[1] = this.maxStaveCount;
      this.scoreRange = [0, this.maxStaveCount];
    }
    this.scoreStateService.reset(this.playConfiguration);
    this.scoreRange = [this.playConfiguration.scoreRange[0], this.playConfiguration.scoreRange[1]];
    //this.playConfiguration.scoreRange = [this.scoreRange[0], this.scoreRange[1]]

    this.isPlaying = false;
    this.ref.detectChanges();
  }

  summary() {
    this.router.navigate(['home/summary']);
  }

  ngOnDestroy(): void {
    for (const sub of this.subscriptions) {
      sub.unsubscribe();
    }
    this.midiService.unsubscribe(this.midiFnHandler)
  }

  brieflyShowKeyboardIfOpportunate() {
    if (!this.hideKeyboard) {
      return;
    }
    this.hideKeyboard = false;
    setTimeout(() => {
      this.hideKeyboard = true;
    }, 3000)
  }





}
