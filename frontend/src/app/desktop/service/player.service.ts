import { Injectable, effect, PLATFORM_ID, inject, OnDestroy, DestroyRef } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
// biome-ignore lint/style/useImportType: <explanation>
import * as Midi from '@tonejs/midi';
import type { Note } from '@tonejs/midi/dist/Note';
import type { PlayConfiguration } from '../model/model';
// biome-ignore lint/style/useImportType: <explanation>
import { MidiServiceService } from '../../shared/services/midi-service.service';
import type { MidiStateEvent } from '../../shared/model/webmidi';
import { reducedFraction } from '../model/reduced-fraction';
import type { TimeSignatureEvent } from '@tonejs/midi/dist/Header';
import { getStaveDurationTick } from './midi-maths';
import { ScoreApiInfo } from '../../core/api';
import { Cursor, GraphicalNote, OpenSheetMusicDisplay, Note as OSMDNote, VexFlowGraphicalNote } from 'opensheetmusicdisplay';
import { PlayerStateService } from './player-state.service';
import { PlayerKeyboardService } from './player-keyboard.service';
import { PlayerAudioService } from './player-audio.service';
import { LiveStatus, NoteKey, PlayerAssessService } from './player-assess.service';
import { CursorService } from './cursor.service';




const TIME_COUNTER_TIMESTEP = 200

@Injectable({
  providedIn: 'root'
})
export class PlayerService implements OnDestroy {



  private platformId = inject(PLATFORM_ID);
  private destroyRef = inject(DestroyRef);
  private isBrowser: boolean;
  private timeCounterInterval?: number;
  private highlightedBadNotes = new Set<GraphicalNote>();
  private badNoteResetTimers = new Map<GraphicalNote, ReturnType<typeof setTimeout>>();
  private midiEventEffectFn?: any;
  private cachedTimeSignatureIndices?: Map<Midi.Header, number[]>;
  verticalPixelShiftValue: number = 1;
  lastBar = 0;

  // Expose state via getters
  get osmd() { return this.state.osmd; }
  //get measure() { return this.state.measure; }
  get tick() { return this.state.tick; }
  get message() { return this.state.message; }
  get elapsedTime() { return this.state.elapsedTime; }
  get duration() { return this.state.duration; }
  get isWaiting() { return this.state.isWaiting; }
  get playConfiguration() { return this.state.playConfiguration; }
  get currentMeasure() { return this.state.currentMeasure; }
  get lastMidiEventTime() { return this.state.lastMidiEventTime; }


  // Setters for state that needs to be modified
  set duration(value: number) { this.state.duration = value; }
  set isWaiting(value: boolean) { this.state.isWaiting = value; }
  set playConfiguration(value: PlayConfiguration) { this.state.playConfiguration = value; }
  set currentMeasure(value: number) { this.state.currentMeasure = value; }
  set lastMidiEventTime(value: number) { this.state.lastMidiEventTime = value; }
  set tick(value: number) { this.state.tick = value; }

  constructor(
    private midiService: MidiServiceService,
    private state: PlayerStateService,
    private keyboard: PlayerKeyboardService,
    private assess: PlayerAssessService,
    private audio: PlayerAudioService,
    private cursorService: CursorService
  ) {
    this.isBrowser = isPlatformBrowser(this.platformId);
    if (this.isBrowser) {
      midiService.setupMidiDeviceListeners();
    }
    this.reset = this.reset.bind(this);

    // Effect to process MIDI events via signal
    this.midiEventEffectFn = effect(() => {
      const midiEvent = this.midiService.midiEvent();
      if (midiEvent) {
        this.processMidiEvent(midiEvent);
      }
    });
  }

  preconfigurePlayConfiguration(scoreApiInfo: ScoreApiInfo, playConfiguration: PlayConfiguration, midiAll: Midi.Midi): PlayConfiguration {
    let study_tracks = [0]
    if (scoreApiInfo?.study_tracks && scoreApiInfo?.study_tracks?.length > 0) {
      study_tracks = scoreApiInfo.study_tracks;
    } else if (midiAll.tracks.length == 1) {
      study_tracks = [0];
    } else if (midiAll.tracks.length == 2) {
      study_tracks = [0, 1];
    }
    const midiAsDefaultTempo = midiAll.header.tempos.every((t) => t.bpm === 120);
    if (midiAsDefaultTempo && scoreApiInfo?.tempo) {
      playConfiguration.tempoFactor = (scoreApiInfo?.tempo || 120) / 120;
    }

    const metronomeStored = localStorage.getItem('tempo-control-metronome');
    if (metronomeStored !== null) {
      playConfiguration.useMetronome = JSON.parse(metronomeStored);
    }

    const midiSplit = this.splitMidi(midiAll.toJSON(), study_tracks);
    playConfiguration.accompaniment = midiSplit.other;
    playConfiguration.midi = midiSplit.study;

    playConfiguration.maxStaveCount = Math.ceil(Math.max(...midiSplit.study.tracks.map(track =>
      track.notes.length > 0 ? track.notes[track.notes.length - 1].bars : 0
    )));
    playConfiguration.scoreRange[0] = 0;
    playConfiguration.scoreRange[1] = playConfiguration.maxStaveCount + 1;
    this.playConfiguration = playConfiguration;
    this.reset(playConfiguration);
    return playConfiguration;
  }


  splitMidi(json: Midi.MidiJSON, studies: number[]): { study: Midi.Midi, other: Midi.Midi } {
    const filteredTracks = json.tracks.filter(track => track.notes.length > 0);

    // json.tracks.forEach((track, idx) => {
    //   console.log(`Track ${idx}: ${track.name}, instrument: ${track.instrument.name}, notes: ${track.notes.length}`);
    // });

    // If studies.length === 1, include all tracks with the same instrument name
    if (studies.length === 1) {
      const studyTrackInstrument = filteredTracks[studies[0]].instrument.name;
      studies = filteredTracks
        .map((track, idx) => ({ idx, instrumentName: track.instrument.name }))
        .filter(item => item.instrumentName === studyTrackInstrument)
        .map(item => item.idx);
    }

    //studies = [0,1]
    const normalizedJson: Midi.MidiJSON = {
      ...json,
      tracks: filteredTracks
    };

    const midiAll = new Midi.Midi();
    midiAll.fromJSON(normalizedJson)
    this.duration = midiAll.duration;
    if (midiAll.header.timeSignatures.length === 0) {
      midiAll.header.timeSignatures.push({ ticks: 0, timeSignature: [4, 4] });
    }

    const studiesSet = new Set(studies);
    const allTracks = midiAll.tracks;

    const midiStudiedTracks = allTracks.filter((track, idx) => {
      return studiesSet.has(idx);
    });

    const midiOtherTracks = allTracks.filter((track, idx) => {
      return !studiesSet.has(idx);
    });

    const midiStudied = midiAll.clone();
    midiStudied.tracks = midiStudiedTracks;

    midiAll.tracks = midiOtherTracks;
    return { study: midiStudied, other: midiAll };
  }



  private setupTimeCounter() {
    // Nettoyer l'ancien interval s'il existe
    if (this.timeCounterInterval) {
      clearInterval(this.timeCounterInterval);
    }

    // Initialize the time counter
    this.elapsedTime.next(0);

    if (!this.isBrowser) {
      return;
    }

    // Create an interval that checks the transport state every TIME_COUNTER_TIMESTEP ms
    this.timeCounterInterval = window.setInterval(() => {
      if (this.audio.isPlaying() && (this.playConfiguration.waitForLeftHand || this.playConfiguration.waitForRightHand)) {
        const currentTime = this.elapsedTime.value + TIME_COUNTER_TIMESTEP;
        this.elapsedTime.next(currentTime);
      }
    }, TIME_COUNTER_TIMESTEP);
  }

  setup() {
    this.setupTimeCounter();
  }

  async initSoundFont() {
    await this.audio.initSoundFont();
  }

  pause() {
    this.audio.pause();
  }

  async reset(playConfiguration: PlayConfiguration) {
    this.playConfiguration = playConfiguration;
    this.state.invalidateTimeFactorCache(); // Invalidate cache when playConfiguration changes
    this.audio.stop();
    this.assess.reset();
    this.lastMidiEventTime = -1;
    this.keyboard.removeAllNotesFromKeyboard();
    this.cursorService.reset(playConfiguration.scoreRange[0]);
  }

  resetLight(playConfiguration: PlayConfiguration) {
    this.playConfiguration = playConfiguration;
    this.state.invalidateTimeFactorCache(); // Invalidate cache when playConfiguration changes
    this.unHighlightBadNote();
    this.lastMidiEventTime = -1;
    this.cursorService.reset(playConfiguration.scoreRange[0]);
  }

  async play(playConfigurations: PlayConfiguration) {
    this.audio.clearSchedule();
    this.unHighlightBadNote();
    this.assess.reset();
    let midiStartTime = this.calculateStartTime();
    let midiEndTime = this.calculateEndTime();

    this.playConfiguration = playConfigurations;
    this.playConfiguration.maxPerformanceStaveCount = this.cursorService.maxMidiMeasure;
    this.state.invalidateTimeFactorCache(); // Invalidate cache when playConfiguration changes

    await this.audio.start();
    let offset = this.audio.startCountIn(
      2,
      this.playConfiguration.midi!.header.timeSignatures[0],
      this.playConfiguration.midi!.header.tempos[0].bpm * this.playConfiguration.tempoFactor
    );
    midiEndTime = midiEndTime + offset;
    // Delegate accompaniment scheduling to the audio service
    this.audio.scheduleAccompanimentTracks(
      this.playConfiguration.accompaniment!,
      midiStartTime,
      midiEndTime,
      this.state.getTimeFactor(),
      offset
    );

    this.scheduleRightHand(this.playConfiguration.midi!.tracks[0], midiStartTime, midiEndTime, offset);
    if (this.playConfiguration.midi!.tracks.length > 1) {
      this.scheduleLeftHand(this.playConfiguration.midi!.tracks[1], midiStartTime, midiEndTime, offset);
    }



    // Delegate end scheduling
    this.audio.scheduleEnd(midiEndTime - midiStartTime, () => {
      this.message.set('END');
      setTimeout(() => {
        this.message.set('');
      }, 100);
      this.playConfiguration.currentStave = this.playConfiguration.scoreRange[0];

      this.reset(this.playConfiguration);
      if (this.playConfiguration.isLoop) {
        this.play(this.playConfiguration);
      }
      this.lastMidiEventTime = -1;
    });
  }



  private scheduleLeftHand(midi: Midi.Track, startTime: number, midiEndTime: number, offset: number) {
    this.audio.scheduleHandTrack(
      'lh',
      midi,
      startTime,
      midiEndTime,
      offset,
      this.state.getTimeFactor(),
      {
        onNoteStart: (time, note, liveStatus) => this.handleNoteStart('lh', note, liveStatus),
        onNoteEnd: (time, note, liveStatus) => this.handleNoteEnd('lh', note, liveStatus)
      }
    );
  }

  private scheduleRightHand(midi: Midi.Track, startTime: number, midiEndTime: number, offset: number) {
    this.audio.scheduleHandTrack(
      'rh',
      midi,
      startTime,
      midiEndTime,
      offset,
      this.state.getTimeFactor(),
      {
        onNoteStart: (time, note, liveStatus) => this.handleNoteStart('rh', note, liveStatus),
        onNoteEnd: (time, note, liveStatus) => this.handleNoteEnd('rh', note, liveStatus)
      }
    );
  }

  displayLiveOnKeyboard() {
    const liveStatus = this.assess.getExpectation();
    this.lightExpectedNotesOnKeyboard(liveStatus)
  }


  private async processMidiEvent(midiEvent: MidiStateEvent) {
    if (!this.playConfiguration
      || (this.playConfiguration.waitForLeftHand === false
        && this.playConfiguration.waitForRightHand === false)
    ) {
      return
    }

    if (midiEvent.type === 'down' as MidiStateEvent['type']) {
      midiEvent.time = this.audio.getCurrentTime();
      const liveStatus = this.assess.getNewActual(this.audio.getTransportSeconds(), midiEvent);
      if (liveStatus === null) {
        return;
      }
      if (!liveStatus.shouldPause) {
        if (this.isWaiting) {
          await this.audio.start();
          this.isWaiting = false;
        }
      }
      if (liveStatus.bad) {
        this.highlightBadNote(midiEvent.note);
      } else {
        this.keyboard.removeMidiPitchFromKeyboard(midiEvent.note);
      }
      this.lightExpectedNotesOnKeyboard(liveStatus);
    }
  }

  private highlightBadNote(pitch: number) {
    const cursor = this.cursorService.cursor!;
    const osmdNotes = cursor.GNotesUnderCursor() as GraphicalNote[];
    let firstSourceNote: any;
    let closest: GraphicalNote | undefined;
    let closestDiff = Number.POSITIVE_INFINITY;
    const targetPitch = pitch - 12;

    for (const note of osmdNotes) {
      if (!note) {
        continue;
      }

      const sourceNote = (note as any).sourceNote;
      if (!sourceNote) {
        continue;
      }

      if (!firstSourceNote) {
        firstSourceNote = sourceNote;
      }

      const halfTone = sourceNote.Pitch?.getHalfTone() || 0;
      const diff = Math.abs(halfTone - targetPitch);
      if (diff < closestDiff) {
        closest = note;
        closestDiff = diff;
      }
    }

    if (!closest) return;
    if (firstSourceNote?.TremoloInfo != null) {
      // Tremolo note, skipping highlight
      return;
    }

    this.message.set("BAD");

    const delta = (closest.sourceNote.halfTone - pitch + 12);
    closest.setColor("#FF0000", {});
    this.highlightedBadNotes.add(closest);
    const closestVexFlowNote = (closest as VexFlowGraphicalNote);
    const svgElement = closestVexFlowNote.getSVGGElement();
    svgElement.style.transform = "translateY(" + (delta * this.verticalPixelShiftValue) + "px) ";

    const existingTimeout = this.badNoteResetTimers.get(closest);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
    }

    const timeoutId = setTimeout(() => {
      svgElement.style.transform = "";
      this.message.set("");
      closest.setColor("black", {});
      this.highlightedBadNotes.delete(closest);
      this.badNoteResetTimers.delete(closest);
    }, 1000);
    this.badNoteResetTimers.set(closest, timeoutId);
  }

  private unHighlightBadNote() {
    if (this.highlightedBadNotes.size === 0) return;

    for (const graphicalNote of this.highlightedBadNotes) {
      try {
        const timeoutId = this.badNoteResetTimers.get(graphicalNote);
        if (timeoutId) {
          clearTimeout(timeoutId);
          this.badNoteResetTimers.delete(graphicalNote);
        }

        graphicalNote.setColor("black", {});
        (graphicalNote as VexFlowGraphicalNote).getSVGGElement().style.transform = "";
      } catch (e) {
        // Ignore errors
      }
    }

    this.badNoteResetTimers.clear();
    this.highlightedBadNotes.clear();
    this.message.set("");
  }



  private handleNoteStart(hand: string, note: Note, liveStatus?: LiveStatus) {
    // look for playerhand
    if (liveStatus?.shouldPause) {
      this.isWaiting = true;
      this.audio.pause();
      this.lightExpectedNotesOnKeyboard(liveStatus);
    }
    // normal operations
    this.cursorMayBeAdvance(note);
    this.keyboard.lightNoteOnKeyboard(hand, note);
    //this.setCurrentTick(note);
  }

  private handleNoteEnd(hand: string, note: Note, liveStatus?: LiveStatus) {
    this.keyboard.removeMidiNoteFromKeyboard(note);
    if (liveStatus?.shouldPause) {
      this.isWaiting = true;
      this.audio.pause();
      this.lightExpectedNotesOnKeyboard(liveStatus);
    }
  }

  private lightExpectedNotesOnKeyboard(liveStatus: LiveStatus) {
    if (liveStatus.expectations.size === 0) return;

    // Find oldest key using Math.min instead of looping
    const oldestKey = Math.min(...liveStatus.expectations.keys());
    const oldestValue = liveStatus.expectations.get(oldestKey);

    if (oldestValue) {
      for (const noteKey of oldestValue) {
        this.keyboard.lightNoteOnKeyboard(noteKey.hand, { midi: noteKey.midi, velocity: 255 } as Note);
      }
    }
  }

  async setOsmd(osmd: OpenSheetMusicDisplay): Promise<number> {
    this.state.osmd = osmd;
    // half tone pixel shift calculation
    this.verticalPixelShiftValue = this.state.osmd!.EngravingRules.StaffDistance / 2;
    return this.cursorService.setup(osmd.cursor, this.playConfiguration.midi!)
  }

  tiltCursor(cursor: Cursor) {
    this.cursorService.tiltCursor(cursor);
  }



  private cursorMayBeAdvance(note: Note) {
    if (note.ticks > this.lastMidiEventTime) {
      this.cursorService.nextNote(note);
      this.lastMidiEventTime = note.ticks;
      return;
    }

  }

  public getAssess(): PlayerAssessService {
    return this.assess;
  }


  private calculateStartTime() {
    const startTime = (this.calculateStartTimeInMsForMeasure(
      this.playConfiguration.scoreRange[0] - 1,
      this.playConfiguration.midi!.header
    ) * this.state.getTimeFactor());
    return startTime;
  }


  private calculateEndTime() {
    // Calculating end time for full score
    // if (this.playConfiguration.scoreRange[1] === this.playConfiguration.maxStaveCount + 1
    //   && this.playConfiguration.scoreRange[0] === 0) {
    //   return this.cursorService.audioTimeNoteArray[this.cursorService.audioTimeNoteArray.length - 1][0]
    //     + this.calculateStartTimeInMsForMeasure(
    //       1,
    //       this.playConfiguration.midi!.header
    //     ) * this.state.getTimeFactor()
    // }
    // Calculating end time for score range
    const endTime = this.calculateStartTimeInMsForMeasure(
      this.playConfiguration.scoreRange[1] - this.playConfiguration.scoreRange[0] +1,
      this.playConfiguration.midi!.header
    ) * this.state.getTimeFactor();
    return endTime + this.calculateStartTime();
  }


  private calculateStartTimeInMsForMeasure(start: number, midiHeader: Midi.Header): number {
    let timeSig: TimeSignatureEvent | undefined = midiHeader.timeSignatures[0];
    let timeSigIndex = 0;
    let elapsedTicks = 0;
    const timeSignatures = midiHeader.timeSignatures;
    const tsLength = timeSignatures.length;

    for (let i = 0; i < start; i++) {
      // Find the correct time signature index for current elapsed ticks
      while (
        timeSigIndex + 1 < tsLength
        && timeSignatures[timeSigIndex + 1].ticks <= elapsedTicks
      ) {
        timeSigIndex += 1;
      }

      timeSig = timeSignatures[timeSigIndex] || timeSig;
      const ts = reducedFraction(timeSig?.timeSignature[0] || 4, timeSig?.timeSignature[1] || 4)
      elapsedTicks += getStaveDurationTick(ts, midiHeader.ppq);
    }
    return midiHeader.ticksToSeconds(elapsedTicks);
  }

  ngOnDestroy(): void {
    // Clear time counter interval
    if (this.timeCounterInterval) {
      clearInterval(this.timeCounterInterval);
      this.timeCounterInterval = undefined;
    }

    // Clean up all bad note highlight timers
    for (const timeoutId of this.badNoteResetTimers.values()) {
      clearTimeout(timeoutId);
    }
    this.badNoteResetTimers.clear();
    this.highlightedBadNotes.clear();

    // Stop audio playback
    this.audio.stop();

    // Cleanup via DestroyRef for effect and other resource cleanup
    this.destroyRef.onDestroy(() => {
      // Effect will be auto-cleaned up by Angular
      this.midiEventEffectFn = null;
    });
  }

}
