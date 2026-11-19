import { Injectable, NgZone, PLATFORM_ID, inject, OnDestroy } from '@angular/core';
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
import { PracticeSessionRecorder } from './practice-session-recorder.service';




const TIME_COUNTER_TIMESTEP = 200

/** Bars of count-in before playback (and before the first awaited note in wait mode). */
export const COUNT_IN_BARS = 2;
/** The count-in bars the metronome dialog offers, and where the choice is kept. */
export const COUNT_IN_MAX_BARS = 4;
export const COUNT_IN_STORAGE_KEY = 'tempo-control-count-in';

/** The count-in chosen in the metronome dialog, COUNT_IN_BARS when none was or storage is unavailable. */
export function readCountInBars(): number {
  try {
    const value = Number(localStorage.getItem(COUNT_IN_STORAGE_KEY) ?? NaN);
    return Number.isInteger(value) && value >= 0 && value <= COUNT_IN_MAX_BARS ? value : COUNT_IN_BARS;
  } catch {
    return COUNT_IN_BARS;
  }
}

@Injectable({
  providedIn: 'root'
})
export class PlayerService implements OnDestroy {



  private platformId = inject(PLATFORM_ID);
  private ngZone = inject(NgZone);
  private recorder = inject(PracticeSessionRecorder);
  private isBrowser: boolean;
  private timeCounterInterval?: number;
  /** Wrong notes shown on the score: the previous pass's, until the count-in of the next one ends. */
  private highlightedBadNotes = new Set<GraphicalNote>();
  /** Wrong notes of the pass in progress: shown when it ends (or is stopped), each with its offset in half tones. */
  private pendingBadNotes = new Map<GraphicalNote, number>();
  private badMessageTimer?: ReturnType<typeof setTimeout>;
  /** Unsubscribes processMidiEvent from the MIDI service. */
  private removeNoteListener: () => void;
  private cachedTimeSignatureIndices?: Map<Midi.Header, number[]>;
  verticalPixelShiftValue: number = 1;
  lastBar = 0;

  // Expose state via getters
  get osmd() { return this.state.osmd; }
  //get measure() { return this.state.measure; }
  get tick() { return this.state.tick; }
  get message() { return this.state.message; }
  get wrongNotes() { return this.state.wrongNotes.asReadonly(); }
  /** Play is only offered once the sounds are 'ready'. */
  get soundFontState() { return this.audio.soundFontState.asReadonly(); }
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

    // A listener, not an effect on the midiEvent signal: an effect runs at the next change detection, which
    // coalesces the notes of a chord arriving in the same frame into the last one and delays every key.
    this.removeNoteListener = midiService.addNoteListener((event) => void this.processMidiEvent(event));
    // The score position the user hears (output latency and calibration included): key presses are scored
    // against what they hear, not against what is being scheduled
    this.assess.setClock(() => this.audio.heardTransportSeconds());
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
    // A MIDI file without a tempo of its own (120 bpm, the default) plays at the score's tempo. Set every time: a
    // tempo chosen for the previous score must not carry over
    const midiAsDefaultTempo = midiAll.header.tempos.every((t) => t.bpm === 120);
    playConfiguration.tempoFactor = midiAsDefaultTempo && scoreApiInfo?.tempo ? scoreApiInfo.tempo / 120 : 1;
    playConfiguration.delayFactor = 1;

    const metronomeStored = localStorage.getItem('tempo-control-metronome');
    if (metronomeStored !== null) {
      playConfiguration.useMetronome = JSON.parse(metronomeStored);
    }
    playConfiguration.countInBars = readCountInBars();

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


  /**
   * Splits the MIDI file into the studied tracks and the accompaniment, dropping the tracks without notes.
   * {@code studies} are indexes in {@code json.tracks} as read from the file, empty tracks included (what the import
   * page and midi2pack.sh store in study_tracks): they are resolved before the empty tracks are dropped, since a
   * format 1 file often starts with an empty track and would shift every index by one.
   */
  splitMidi(json: Midi.MidiJSON, studies: number[]): { study: Midi.Midi, other: Midi.Midi } {
    // Position of each track with notes in the file
    const fileIndexes = json.tracks.map((_, idx) => idx).filter(idx => json.tracks[idx].notes.length > 0);
    const filteredTracks = fileIndexes.map(idx => json.tracks[idx]);

    // If studies.length === 1, include all tracks with the same instrument name
    if (studies.length === 1 && json.tracks[studies[0]]) {
      const studyTrackInstrument = json.tracks[studies[0]].instrument.name;
      studies = fileIndexes.filter(idx => json.tracks[idx].instrument.name === studyTrackInstrument);
    }
    // From file indexes to positions among the tracks with notes
    const studiesSet = new Set(studies.map(idx => fileIndexes.indexOf(idx)).filter(pos => pos >= 0));

    const normalizedJson: Midi.MidiJSON = {
      ...json,
      tracks: filteredTracks
    };

    const midiAll = new Midi.Midi();
    midiAll.fromJSON(normalizedJson)
    this.duration = midiAll.duration;
    if (midiAll.header.timeSignatures.length === 0) {
      midiAll.header.timeSignatures.push({ ticks: 0, timeSignature: [4, 4] });
      // update() computes the signature's `measures`: without it every note's `bars` is NaN
      // (and so are maxStaveCount, the score range and the playback end time)
      midiAll.header.update();
    }

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

    // Create an interval that checks the transport state every TIME_COUNTER_TIMESTEP ms. Outside the Angular zone:
    // in the zone, each tick ran change detection app-wide, 5 times a second, even when the time did not change
    // (play-along). The async pipe showing the time marks the view itself when it does.
    this.timeCounterInterval = this.ngZone.runOutsideAngular(() => window.setInterval(() => {
      if (this.audio.isPlaying() && (this.playConfiguration.waitForLeftHand || this.playConfiguration.waitForRightHand)) {
        const currentTime = this.elapsedTime.value + TIME_COUNTER_TIMESTEP;
        this.elapsedTime.next(currentTime);
      }
    }, TIME_COUNTER_TIMESTEP));
  }

  setup() {
    this.setupTimeCounter();
  }

  async initSoundFont() {
    await this.audio.initSoundFont();
  }

  releaseScoreSession(): void {
    // Before the assessment is reset: the recorder reads the counters of the take in progress
    this.recorder.setItem(null);
    this.audio.resetSession();
    this.midiService.resetSessionOutputs();
    this.unHighlightBadNote();
    this.keyboard.removeAllNotesFromKeyboard();
    this.cursorService.resetSession();
    this.assess.reset();
    this.state.resetSession();
    this.verticalPixelShiftValue = 1;
    this.lastBar = 0;
  }

  pause() {
    this.audio.pause();
    this.recorder.takeEnded(false);
    this.revealBadNotes(); // stopped: the wrong notes of what was played
  }

  async reset(playConfiguration: PlayConfiguration) {
    this.playConfiguration = playConfiguration;
    this.state.invalidateTimeFactorCache(); // Invalidate cache when playConfiguration changes
    this.audio.stop();
    this.recorder.takeEnded(false); // a take still open is cut short (no-op after a pause or the end)
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
    // temporary debug: separates the [assess] logs of each pass (loop mode), with what shifts the key presses scored
    console.log(`============== correction ${this.audio.latencyCalibrationMs()} ms (a key press is scored this much earlier), `
      + `output latency ${Math.round((this.audio.getContextTimeLag()) * 1000)} ms`);
    this.audio.clearSchedule();
    this.pendingBadNotes.clear(); // the new pass collects its own
    this.recorder.takeEnded(false);
    this.assess.reset();
    this.recorder.takeStarted(playConfigurations);
    let midiStartTime = this.calculateStartTime();
    let midiEndTime = this.calculateEndTime();

    this.playConfiguration = playConfigurations;
    this.playConfiguration.maxPerformanceStaveCount = this.cursorService.maxMidiMeasure;
    this.state.invalidateTimeFactorCache(); // Invalidate cache when playConfiguration changes

    let offset = this.audio.startCountIn(
      this.playConfiguration.countInBars ?? COUNT_IN_BARS,
      this.playConfiguration.midi!.header.timeSignatures[0],
      this.playConfiguration.midi!.header.tempos[0].bpm * this.playConfiguration.tempoFactor
    );
    midiEndTime = midiEndTime + offset;
    // The previous pass's wrong notes stay on the score during the count-in, and go when the playing starts again
    if (offset > 0) {
      this.audio.schedule((time) => this.audio.scheduleDraw(() => this.unHighlightBadNote(), time), offset);
    } else {
      this.unHighlightBadNote();
    }
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

    // The notes go on the transport a few seconds ahead of it, from where it (re)starts
    this.audio.startRollingSchedule();
    // Play after Pause resumes the transport where it stopped: the notes before it will never be played
    this.assess.beginTimed(this.audio.getTransportSeconds());

    // Delegate end scheduling
    this.audio.scheduleEnd(midiEndTime - midiStartTime, () => {
      this.message.set('END');
      setTimeout(() => {
        this.message.set('');
      }, 100);
      this.playConfiguration.currentStave = this.playConfiguration.scoreRange[0];

      // The take reached the end of its range; recorded before reset() clears the assessment
      this.assess.endTimed();
      this.revealBadNotes();
      this.recorder.takeEnded(true);
      this.reset(this.playConfiguration);
      if (this.playConfiguration.isLoop) {
        this.play(this.playConfiguration);
      }
      this.lastMidiEventTime = -1;
    });

    // Last, once everything is scheduled: started earlier, the transport could pass the first click meanwhile
    await this.audio.start();
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
        onNoteStart: (time, note, liveStatus) => this.handleNoteStart('lh', time, note, liveStatus),
        onNoteEnd: (time, note, liveStatus) => this.handleNoteEnd('lh', time, note, liveStatus)
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
        onNoteStart: (time, note, liveStatus) => this.handleNoteStart('rh', time, note, liveStatus),
        onNoteEnd: (time, note, liveStatus) => this.handleNoteEnd('rh', time, note, liveStatus)
      }
    );
  }


  private async processMidiEvent(midiEvent: MidiStateEvent) {
    if (midiEvent.type === 'down') {
      // Before any mode check: a key played along the score also makes the session a MIDI one
      this.recorder.noteOn();
    }
    if (!this.playConfiguration) {
      return
    }
    if (!this.playConfiguration.waitForLeftHand && !this.playConfiguration.waitForRightHand) {
      // Play-along: each key press is matched with the score notes due around that time
      if (midiEvent.type === 'down' && this.audio.isPlaying()) {
        // When the key was played (the MIDI message's timestamp), on the clock of what the user heard then
        const { bad } = this.assess.playTimed(this.audio.heardTransportSeconds(midiEvent.timeStamp), midiEvent.note);
        if (bad) {
          this.showWrongNote(midiEvent.note);
        }
      }
      return
    }

    if (midiEvent.type === 'down') {
      midiEvent.time = this.audio.getCurrentTime();
      const liveStatus = this.assess.getNewActual(this.audio.getTransportSeconds(), midiEvent);
      if (liveStatus === null) {
        return;
      }
      if (!liveStatus.shouldPause && this.isWaiting) {
        // Synchronously, in the MIDI listener: the music goes on with the key. start() and its awaits only when
        // something has to be started first.
        this.isWaiting = false;
        if (!this.audio.resumeNow()) {
          await this.audio.start();
        }
      }
      if (liveStatus.bad) {
        this.showWrongNote(midiEvent.note);
      } else {
        this.keyboard.removeMidiPitchFromKeyboard(midiEvent.note);
      }
      this.lightExpectedNotesOnKeyboard(liveStatus);
    }
  }

  /**
   * A wrong note, as it is played (synchronously, from the MIDI listener), in both modes: BAD and the count at once,
   * the note on the score only when the pass ends (see revealBadNotes()), not to distract while playing. The
   * on-screen keyboard never lights the keys the user plays, right or wrong.
   */
  private showWrongNote(pitch: number) {
    this.collectBadNote(pitch);
    this.message.set("BAD");
    clearTimeout(this.badMessageTimer);
    this.badMessageTimer = setTimeout(() => this.message.set(""), 1000);
    this.state.wrongNotes.update((count) => count + 1);
  }

  /** Remembers the score note under the cursor closest to `pitch`, and how far from it the key was (half tones). */
  private collectBadNote(pitch: number) {
    const cursor = this.cursorService.cursor;
    if (!cursor) return;
    const osmdNotes = cursor.GNotesUnderCursor() as GraphicalNote[];
    let firstSourceNote: any;
    let closest: GraphicalNote | undefined;
    let closestDiff = Number.POSITIVE_INFINITY;
    const targetPitch = pitch - 12;

    for (const note of osmdNotes) {
      const sourceNote = (note as any)?.sourceNote;
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

    if (!closest || firstSourceNote?.TremoloInfo != null) return; // tremolo notes are not marked
    this.pendingBadNotes.set(closest, closest.sourceNote.halfTone - pitch + 12);
  }

  /** The pass ended or was stopped: its wrong notes in red on the score, each moved by how far off the key was. */
  private revealBadNotes() {
    for (const [note, delta] of this.pendingBadNotes) {
      try {
        note.setColor("#FF0000", {});
        (note as VexFlowGraphicalNote).getSVGGElement().style.transform = "translateY(" + (delta * this.verticalPixelShiftValue) + "px) ";
        this.highlightedBadNotes.add(note);
      } catch {
        // a note no longer rendered
      }
    }
    this.pendingBadNotes.clear();
  }

  private unHighlightBadNote() {
    if (this.highlightedBadNotes.size === 0) return;

    for (const graphicalNote of this.highlightedBadNotes) {
      try {
        graphicalNote.setColor("black", {});
        (graphicalNote as VexFlowGraphicalNote).getSVGGElement().style.transform = "";
      } catch (e) {
        // Ignore errors
      }
    }

    this.highlightedBadNotes.clear();
  }



  /**
   * A note becomes due, in the transport callback: the pause decision is taken here, at once. The cursor and the
   * key lights go through Tone.Draw, at the frame the note sounds.
   */
  private handleNoteStart(hand: string, time: number, note: Note, liveStatus?: LiveStatus) {
    const pause = !!liveStatus?.shouldPause;
    if (pause) {
      this.isWaiting = true;
      this.audio.pause();
    }
    this.recorder.activity();
    this.audio.scheduleDraw(() => {
      if (pause) {
        this.lightExpectedNotesOnKeyboard(liveStatus!);
      }
      this.cursorMayBeAdvance(note);
      this.keyboard.lightNoteOnKeyboard(hand, note);
    }, time);
  }

  private handleNoteEnd(hand: string, time: number, note: Note, liveStatus?: LiveStatus) {
    const pause = !!liveStatus?.shouldPause;
    if (pause) {
      this.isWaiting = true;
      this.audio.pause();
    }
    this.audio.scheduleDraw(() => {
      this.keyboard.removeMidiNoteFromKeyboard(note);
      if (pause) {
        this.lightExpectedNotesOnKeyboard(liveStatus!);
      }
    }, time);
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
    // The cursor service keeps the cursor in view itself, scrolling only near the edges: OSMD's follow scrolled on
    // every step
    if (osmd.FollowCursor) {
      this.cursorService.follow = true;
      osmd.FollowCursor = false;
    }
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
    const endTime = this.calculateStartTimeInMsForMeasure(
      this.playConfiguration.scoreRange[1] - this.playConfiguration.scoreRange[0],
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

    // Wrong notes: the BAD message timer, those collected and those shown
    clearTimeout(this.badMessageTimer);
    this.pendingBadNotes.clear();
    this.highlightedBadNotes.clear();

    // Stop audio playback and release score-scoped state
    this.releaseScoreSession();

    this.removeNoteListener();
  }

}
