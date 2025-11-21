import { type ElementRef, Injectable, signal, effect } from '@angular/core';
// biome-ignore lint/style/useImportType: <explanation>
import * as Midi from '@tonejs/midi';
import type { Note } from '@tonejs/midi/dist/Note';
import type { lateNote, PlayConfiguration } from '../model/model';
// biome-ignore lint/style/useImportType: <explanation>
import { MidiServiceService } from '../../shared/services/midi-service.service';
import type { MidiStateEvent } from '../../shared/model/webmidi';
import { reducedFraction } from '../model/reduced-fraction';
import type { TimeSignatureEvent } from '@tonejs/midi/dist/Header';
import { getStaveDurationTick } from './midi-maths';
import { ScoreApiInfo } from '../../core/api';
import { OpenSheetMusicDisplay, Note as OSMDNote } from 'opensheetmusicdisplay';
import { PlayerStateService } from './player-state.service';
import { PlayerKeyboardService } from './player-keyboard.service';
import { PlayerRepetitionService } from './player-repetition.service';
import { PlayerAudioService } from './player-audio.service';


const GOOD_RANGE = 0.2
const TIME_COUNTER_TIMESTEP = 200

@Injectable({
  providedIn: 'root'
})
export class PlayerService {

  private midiSetupTimeout?: number;
  private timeCounterInterval?: number;

  // Expose state via getters
  get osmd() { return this.state.osmd; }
  get osmdCursor() { return this.state.osmdCursor; }
  get measure() { return this.state.measure; }
  get message() { return this.state.message; }
  get elapsedTime() { return this.state.elapsedTime; }
  get duration() { return this.state.duration; }
  get isWaiting() { return this.state.isWaiting; }
  get playConfiguration() { return this.state.playConfiguration; }
  get currentMeasure() { return this.state.currentMeasure; }
  get lastMidiEventTime() { return this.state.lastMidiEventTime; }
  get lateNotes() { return this.state.lateNotes; }

  // Setters for state that needs to be modified
  set duration(value: number) { this.state.duration = value; }
  set isWaiting(value: boolean) { this.state.isWaiting = value; }
  set playConfiguration(value: PlayConfiguration) { this.state.playConfiguration = value; }
  set currentMeasure(value: number) { this.state.currentMeasure = value; }
  set lastMidiEventTime(value: number) { this.state.lastMidiEventTime = value; }

  constructor(
    private midiService: MidiServiceService,
    private state: PlayerStateService,
    private keyboard: PlayerKeyboardService,
    private repetition: PlayerRepetitionService,
    private audio: PlayerAudioService
  ) {
    midiService.setupMidiDeviceListeners();
    this.reset = this.reset.bind(this);

    // Effet pour traiter les événements MIDI via signal
    effect(() => {
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
    const midiAsDefaultTempo = midiAll.header.tempos.every((t) => { t.bpm === 120; return true });
    if (midiAsDefaultTempo && scoreApiInfo?.tempo) {
      playConfiguration.tempoFactor = (scoreApiInfo?.tempo || 120) / 120;
    }

    const midiSplit = this.splitMidi(midiAll.toJSON(), study_tracks);
    playConfiguration.accompaniment = midiSplit.other;
    playConfiguration.midi = midiSplit.study;

    playConfiguration.maxStaveCount = Math.ceil(Math.max(...midiSplit.study.tracks.map(track =>
      track.notes.length > 0 ? track.notes[track.notes.length - 1].bars : 0
    )));
    playConfiguration.scoreRange[0] = 1;
    playConfiguration.scoreRange[1] = playConfiguration.maxStaveCount + 1;
    this.playConfiguration = playConfiguration;
    this.reset(playConfiguration);
    return playConfiguration;
  }


  splitMidi(json: Midi.MidiJSON, studies: number[]): { study: Midi.Midi, other: Midi.Midi } {

    // Remove tracks with no notes
    json.tracks = json.tracks.filter(track => track.notes.length > 0);

    json.tracks.forEach((track, idx) => {
      console.log(`Track ${idx}: ${track.name}, instrument: ${track.instrument.name}, notes: ${track.notes.length}`);
    });

    // If studies.length === 1, include all tracks with the same instrument name
    if (studies.length === 1) {
      const studyTrackInstrument = json.tracks[studies[0]].instrument.name;
      studies = json.tracks
        .map((track, idx) => ({ idx, instrumentName: track.instrument.name }))
        .filter(item => item.instrumentName === studyTrackInstrument)
        .map(item => item.idx);
      console.log(`Extended studies to all tracks with instrument "${studyTrackInstrument}":`, studies);
    }

    //studies = [0,1]
    const midiAll = new Midi.Midi();
    midiAll.fromJSON(json)
    this.duration = midiAll.duration;
    if (midiAll.header.timeSignatures.length === 0) {
      midiAll.header.timeSignatures.push({ ticks: 0, timeSignature: [4, 4] });
    }

    const midiStudied = midiAll.clone();
    const midiOther = midiAll.clone();

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

  initPiano() {
    this.audio.initPiano();
  }

  private setupTimeCounter() {
    // Nettoyer l'ancien interval s'il existe
    if (this.timeCounterInterval) {
      clearInterval(this.timeCounterInterval);
    }

    // Initialiser le compteur de temps
    this.elapsedTime.next(0);

    // Créer un interval qui vérifie toutes les TIME_COUNTER_TIMESTEP ms l'état du transport
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


  setKeyboardElement(nativeElementRef: ElementRef) {
    this.keyboard.setKeyboardElement(nativeElementRef);
    this.setup();
  }

  pause() {
    this.audio.pause();
    this.keyboard.removeAllNotesFromKeyboard();
  }

  async reset(playConfiguration: PlayConfiguration) {
    this.playConfiguration = playConfiguration;
    this.state.invalidateTimeFactorCache(); // Invalidate cache when playConfiguration changes
    this.audio.stop();
    this.resetLateNotes();
    this.lastMidiEventTime = -1;
    // Reset repetition tracking
    this.repetition.reset();
    if (this.osmdCursor !== null) {
      this.repetition.hydrateRepetitionInstructions();
      this.osmdCursor.reset();
      for (let i = 0; i < this.playConfiguration.currentStave - 1; i++) {
        this.osmdCursor.nextMeasure();
      }
    }
  }

  async play(playConfigurations: PlayConfiguration) {
    if (this.lastMidiEventTime === -1) {
      this.osmdCursor.previous();
    }
    this.resetLateNotes();
    const startOffset = this.calculateStartTime();
    const endCut = this.calculateEndTime();
    this.playConfiguration = playConfigurations;
    this.state.invalidateTimeFactorCache(); // Invalidate cache when playConfiguration changes
    
    await this.audio.start();
    
    this.scheduleRightHand(this.playConfiguration.midi!.tracks[0], startOffset, endCut);
    if (this.playConfiguration.midi!.tracks.length > 1) {
      this.scheduleLeftHand(this.playConfiguration.midi!.tracks[1], startOffset, endCut);
    }
    
    // Déléguer le scheduling de l'accompagnement au service audio
    this.audio.scheduleAccompanimentTracks(
      this.playConfiguration.accompaniment!,
      startOffset,
      endCut,
      this.state.getTimeFactor()
    );
    
    // Déléguer le scheduling de fin
    this.audio.scheduleEnd(endCut - startOffset, () => {
      this.message.set("END");
      this.playConfiguration.currentStave = this.playConfiguration.scoreRange[0];
      this.reset(this.playConfiguration);
      if (this.playConfiguration.isLoop) {
        this.play(this.playConfiguration);
      }
      this.lastMidiEventTime = -1;
    });
  }

  scheduleLeftHand(midi: Midi.Track, startTime: number, endCut: number) {
    this.audio.scheduleHandTrack(
      'lh',
      midi,
      startTime,
      endCut,
      this.state.getTimeFactor(),
      GOOD_RANGE,
      {
        onNoteStart: (time, note) => this.handleNoteStart('lh', note),
        onNoteEnd: (time, note) => this.handleNoteEnd('lh', note),
        beforeGoodRange: (time, note) => this.handleBeforeGoodRange(note)
      }
    );
  }

  scheduleRightHand(midi: Midi.Track, startTime: number, endCut: number) {
    this.audio.scheduleHandTrack(
      'rh',
      midi,
      startTime,
      endCut,
      this.state.getTimeFactor(),
      GOOD_RANGE,
      {
        onNoteStart: (time, note) => this.handleNoteStart('rh', note),
        onNoteEnd: (time, note) => this.handleNoteEnd('lh', note),
        beforeGoodRange: (time, note) => this.handleBeforeGoodRange(note)
      }
    );
  }

  private handleNoteStart(hand: string, note: Note) {
    this.cursorMayBeAdvance(note);
    this.keyboard.lightNoteOnKeyboard(hand, note);
    if (this.lateNotes.size > 0) {
      this.isWaiting = true;
      this.audio.pause();
    }
    if (this.isHandOk(hand, note.midi)) {
      this.pushLateNote(note);
    }
    this.setCurrentTick(note.bars);
  }

  private handleNoteEnd(hand: string, note: Note) {
    if (!this.isHandOk(hand, note.midi)) {
      // Vérifier d'abord si la note est en attente avant la recherche DOM
      const isNoteAwaited = Array.from(this.lateNotes.values())
        .some(lateNotesList =>
          lateNotesList.some(lateNote => lateNote.note.midi === note.midi)
        );

      if (!isNoteAwaited) {
        this.keyboard.removeMidiNoteFromKeyboard(note.midi);
      } else {
        this.keyboard.lightNoteOnKeyboard('late', note);
      }
    }
  }

  private handleBeforeGoodRange(note: Note) {
    if (this.lateNotes.size > 1) {
      this.isWaiting = true;
      this.audio.pause();
    }
  }

  setOsmd(osmd: OpenSheetMusicDisplay) {
    this.state.osmd = osmd;
    this.state.osmdCursor = this.state.osmd.cursor;
    this.state.osmdCursor.CursorOptions.color = "#B0F2B4";
    this.state.osmdCursor.CursorOptions.alpha = 0.6;
    this.repetition.hydrateRepetitionInstructions();
    this.state.osmdCursor.reset();
  }

  private cursorMayBeAdvance(note: Note) {
    if (note.ticks > this.lastMidiEventTime) {
      this.lastMidiEventTime = note.ticks;
      this.currentMeasure = Math.floor(note.bars);

      this.osmdCursor.next();

      // Handle repetitions
      this.repetition.maybeMoveToMeasure(this.osmdCursor.iterator);

      // Skip rest notes, tied notes, and cue notes
      let safety = 0;
      while (safety < 100 && this.osmdCursor.NotesUnderCursor().every(n => this.isSkipable(n))) {
        this.osmdCursor.next();
        this.repetition.maybeMoveToMeasure(this.osmdCursor.iterator);
        safety++;
      }

      // Update cursor color based on correctness
      if (!this.isCursorOk(note)) {
        this.osmdCursor.CursorOptions.color = '#FFB3BA';
        this.osmdCursor.CursorOptions.alpha = 0.3;
      } else {
        this.osmdCursor.CursorOptions.color = "#B0F2B4";
        this.osmdCursor.CursorOptions.alpha = 0.6;
      }
    }
  }

  isCursorOk(note: Note): boolean {
    return this.osmdCursor.NotesUnderCursor().map(n => n.Pitch?.getHalfTone()).some(n => n === note.midi - 12);
  }

  isSkipable(n: OSMDNote): unknown {
    return n.isRest()
      || (n.NoteTie && n.NoteTie?.Notes.at(0)?.NoteToGraphicalNoteObjectId !== n.NoteToGraphicalNoteObjectId)
      || n.IsCueNote
  }

  private setCurrentTick(bar: number) {
    const truncatedBar = Math.trunc(bar);
    if (truncatedBar !== this.measure()) {
      this.measure.set(truncatedBar);
    }
  }

  private isHandOk(hand: string, midiPitch: number) {
    return (((hand === 'rh' && this.playConfiguration.waitForRightHand)
      || (hand === 'lh' && this.playConfiguration.waitForLeftHand))
      && (midiPitch >= this.state.leftmostKey && midiPitch <= this.state.rightmostKey)
    );
  }

  calculateStartTime() {
    const startTime = (this.calculateStartTimeInMsForMeasure(
      this.playConfiguration.scoreRange[0] - 1,
      this.playConfiguration.midi!.header
    ) * this.state.getTimeFactor());
    return startTime;
  }


  calculateEndTime() {
    if (this.playConfiguration.scoreRange[1] === this.playConfiguration.maxStaveCount + 1
      && this.playConfiguration.scoreRange[0] === 1) {
      return this.duration * this.state.getTimeFactor();
    }
    return (this.calculateStartTimeInMsForMeasure(
      this.playConfiguration.scoreRange[1] + 1,
      this.playConfiguration.midi!.header
    ) * this.state.getTimeFactor());
  }


  calculateStartTimeInMsForMeasure(start: number, midiHeader: Midi.Header): number {
    let timeSig: TimeSignatureEvent | undefined = midiHeader.timeSignatures[0];
    let elapsedTicks = 0;
    for (let i = 0; i < start; i++) {
      timeSig = midiHeader.timeSignatures.filter((t) => t.ticks <= elapsedTicks).at(-1);
      elapsedTicks += getStaveDurationTick(reducedFraction(timeSig?.timeSignature[0] || 4, timeSig?.timeSignature[1] || 4), midiHeader.ppq);
    }
    return midiHeader.ticksToSeconds(elapsedTicks);
  }


  resetLateNotes() {
    this.state.resetLateNotes();
    this.keyboard.removeAllNotesFromKeyboard();
  }


  pushLateNote(note: Note) {
    const lateNoteEntry: lateNote = { note: note, pressed: false };

    // Add to both structures for backward compatibility and fast lookup
    if (!this.lateNotes.has(note.ticks)) {
      this.lateNotes.set(note.ticks, []);
    }
    this.lateNotes.get(note.ticks)!.push(lateNoteEntry);
  }

  private integrateMidiEventInLastNote(midiEvent: MidiStateEvent): number {
    let success = -1;
    const entries = Array.from(this.lateNotes.entries());

    for (const [key, notes] of entries) {
      for (let idx = notes.length - 1; idx >= 0; idx--) {
        const ln = notes[idx];
        if (midiEvent.note === ln.note.midi) {
          notes.splice(idx, 1);
          this.keyboard.removeMidiNoteFromKeyboard(ln.note.midi);
          if (idx === 0) {
            success = 1;
          } else {
            success = 0;
          }
        }
      }
      if (notes.length === 0) {
        this.lateNotes.delete(key);
        success = 1;
      }
    }
    return success;
  }


  private async processMidiEvent(midiEvent: MidiStateEvent) {
    if (!this.playConfiguration
      || (this.playConfiguration.waitForLeftHand === false
        && this.playConfiguration.waitForRightHand === false)
    ) {
      return
    }
    if (midiEvent.type === 'down' as MidiStateEvent['type']) {

      const hit = this.integrateMidiEventInLastNote(midiEvent);
      if (this.lateNotes.size === 0 && this.isWaiting) {
        await this.audio.start();
        this.isWaiting = false;
      } else {
        this.lateNotes.forEach((lateNotesList) => {
          lateNotesList.forEach((lateNote) => {
            this.keyboard.lightNoteOnKeyboard('rh', lateNote.note); // todo assign hand properly
          });
        });
      }
      if (hit < 1) {
        this.message.set("BAD");
        setTimeout(() => {
          this.message.set("");
        }, 10);
      }
    }
  }

  /**
   * Nettoie les ressources du service, notamment l'interval du compteur de temps
   */
  cleanup() {
    if (this.timeCounterInterval) {
      clearInterval(this.timeCounterInterval);
      this.timeCounterInterval = undefined;
    }
    if (this.midiSetupTimeout) {
      clearTimeout(this.midiSetupTimeout);
      this.midiSetupTimeout = undefined;
    }
    // Clear DOM caches to prevent memory leaks
    this.keyboard.cleanup();
  }
}
