import { type ElementRef, Injectable, signal } from '@angular/core';
import * as Tone from "tone";
// biome-ignore lint/style/useImportType: <explanation>
import * as Midi from '@tonejs/midi';
import type { Note } from '@tonejs/midi/dist/Note';
import { BehaviorSubject } from 'rxjs';
import type { lateNote, PlayConfiguration, StaveAndStaveNotesPair } from '../model/model';
// biome-ignore lint/style/useImportType: <explanation>
import { MidiServiceService } from '../../shared/services/midi-service.service';
import type { MidiStateEvent } from '../../shared/model/webmidi';
import { reducedFraction } from '../model/reduced-fraction';
import type { TimeSignatureEvent } from '@tonejs/midi/dist/Header';
import { Synthetizer } from "spessasynth_lib"
import { Piano } from '@tonejs/piano'
import { getStaveDuration, getStaveDurationTick, midiToPitch } from './midi-maths';
import { ScoreApiInfo } from '../../core/api';
import { Cursor, Note as OSMDNote } from 'opensheetmusicdisplay';


const GOOD_RANGE = 0.2
const PERFECT_RANGE = 0.02
const TIME_COUNTER_TIMESTEP = 200

@Injectable({
  providedIn: 'root'
})
export class PlayerService {

  osmdCursor: Cursor = null as unknown as Cursor;

  setOsmdCursor(cursor: Cursor) {
    this.osmdCursor = cursor;
  }

  private keyboardElement!: ElementRef;
  public measure = new BehaviorSubject<number>(0);
  public message = signal<string>("");
  public elapsedTime = new BehaviorSubject<number>(0);

  duration = 0;


  isWaiting = false
  currentTime = 0;
  playConfiguration!: PlayConfiguration;
  midiFnHandle?: (e: MidiStateEvent) => void;
  synth: Tone.Synth<Tone.SynthOptions> | undefined;
  soundFontArrayBuffer!: ArrayBuffer;
  spessasynth?: Synthetizer;

  midiPressedNotes: Set<number> = new Set<number>();
  lateNotes: Map<number, lateNote[]> = new Map<number, lateNote[]>();
  piano: any;
  lastMidiEventTime = 0;
  private timeCounterInterval?: number;

  constructor(private midiService: MidiServiceService) {
    this.initSoundFont();
    this.synth = new Tone.Synth().toDestination();
    this.initPiano();
    this.reset = this.reset.bind(this);
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
    this.piano = new Piano({
      velocities: 1
    }).toDestination();
    this.piano.load()
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
      if (Tone.getTransport().state === "started" && (this.playConfiguration.waitForLeftHand || this.playConfiguration.waitForRightHand)) {
        const currentTime = this.elapsedTime.value + TIME_COUNTER_TIMESTEP;
        this.elapsedTime.next(currentTime);
      }
    }, TIME_COUNTER_TIMESTEP);
  }

  setup() {
    if (this.midiFnHandle) {
      this.midiService.unsubscribe(this.midiFnHandle)
    }

    this.setupTimeCounter();

    setTimeout(() => {
      this.midiFnHandle = this.midiService.subscribe((midiEvent) => this.processMidiEvent(midiEvent))
    }, 2000)
  }



  async initSoundFont() {
    if (this.spessasynth != null) {
      return; // already initialized
    }
    const ctx = new AudioContext();
    await ctx.audioWorklet.addModule("/assets/soundfonts/worklet_processor.min.js")
    fetch("assets/soundfonts/GeneralUserGS.sf3").then(async response => {
      const sfont = await response.arrayBuffer();
      this.spessasynth = new Synthetizer(ctx.destination, sfont, false);
      this.spessasynth.resetControllers();
    });
  }


  setKeyboardElement(nativeElementRef: ElementRef) {
    this.keyboardElement = nativeElementRef;
    this.setup();
  }

  pause() {
    this.spessasynth?.stopAll();
    Tone.getTransport().pause();
    this.removeAllNotesFromKeyboard()
  }

  async reset(playConfiguration: PlayConfiguration) {
    this.playConfiguration = playConfiguration;
    Tone.getTransport().stop();
    Tone.getTransport().position = 0;
    Tone.getTransport().cancel();
    Tone.getDraw().dispose();
    Tone.getDraw().cancel();
    this.resetLateNotes();
    this.lastMidiEventTime = -1;
    if (this.osmdCursor !== null) {
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
    //this.lastMidiEventTime = -1;
    this.resetLateNotes();
    const startOffset = this.calculateStartTime();
    const endCut = this.calculateEndTime();
    this.playConfiguration = playConfigurations;
    await Tone.start();
    this.scheduleRightHand(this.playConfiguration.midi!.tracks[0], startOffset, endCut);
    if (this.playConfiguration.midi!.tracks.length > 1) {
      this.scheduleLeftHand(this.playConfiguration.midi!.tracks[1], startOffset, endCut);
    }
    this.scheduleAccompanimentTracks(this.playConfiguration.accompaniment!, startOffset, endCut);
    this.scheduleEnd(endCut - startOffset);
    //Tone.getContext().lookAhead = 0
    Tone.getTransport().start();
  }

  scheduleLeftHand(midi: Midi.Track, startTime: number, endCut: number) {
    for (const note of midi.notes) {
      if (this.isInPlayableRange(note, startTime, endCut)) {
        this.scheduleNote('lh', note, startTime);
      }


    }
  }
  scheduleRightHand(midi: Midi.Track, startTime: number, endCut: number) {
    for (const note of midi.notes) {
      if (this.isInPlayableRange(note, startTime, endCut)) {
        this.scheduleNote('rh', note, startTime);
      }
    }
  }

  private scheduleAccompanimentTracks(midiOther: Midi.Midi, startTime: number, endCut: number) {
    let i = 0;
    for (const track of midiOther.tracks) {
      this.spessasynth?.programChange(midiOther.tracks[i].channel, track.instrument.number);
      this.scheduleAccompanimentTrack(midiOther.tracks[i].channel, track, startTime, endCut);
      i++;
    }
  }

  private isInPlayableRange(note: Note, startTime: number, endCut: number) {
    return !((note.time * this.getTimeFactor()) < (startTime)
      || (note.time * this.getTimeFactor()) >= (endCut))
  }

  private scheduleAccompanimentTrack(channel: number, track: Midi.Track, startTime: number, endCut: number) {
    for (const note of track.notes) {
      if (this.isInPlayableRange(note, startTime, endCut)) {
        this.scheduleAccompanimentTrackNotes(channel, note, startTime);
      }
    }
  }

  private scheduleAccompanimentTrackNotes(channel: number, note: Note, startOffset: number) {
    if (note.time < startOffset) return;
    if (note.midi === 0) return; // skip rest notes
    const noteStart = (note.time * this.getTimeFactor()) - startOffset;
    // note on
    Tone.getTransport().schedule(() => {
      this.spessasynth?.noteOn(channel, note.midi, Math.round(note.velocity * 127));
    }, noteStart);
    // note off
    Tone.getTransport().schedule(() => {
      this.spessasynth?.noteOff(channel, note.midi);
    }, noteStart + (note.duration * this.getTimeFactor()));
  }


  private cursorMayBeAdvance(note: Note) {
    if (note.ticks > this.lastMidiEventTime) {
      this.osmdCursor.next();
      this.lastMidiEventTime = note.ticks;
      let safety = 0;
      setTimeout(() => {
        while (safety < 10 && this.osmdCursor.NotesUnderCursor().length > 0 && this.osmdCursor.NotesUnderCursor().every(n => this.isSkipable(note,n))) {
          this.osmdCursor.next();
          safety++;
        }
      }, 40);    
  } else if (note.ticks<this.lastMidiEventTime) { 
      console.log("Rewind detected, not advancing curso back ????")
  }



}

isSkipable(note:Note, n: OSMDNote): unknown {
  //console.log(Math.floor(note.bars)+1, n.SourceMeasure.MeasureNumber)
  return n.isRest() || n.IsCueNote || n.NoteTie?.Notes.last() === n; // || (Math.floor(note.bars)+1 > n.SourceMeasure.MeasureNumber);
}



  private scheduleNote(hand: string, note: Note, startTime: number) {

  if (note.midi === 0) return;
  const noteTimeStart = (note.time * this.getTimeFactor()) - startTime;
  const noteTimeEnd = ((note.time * this.getTimeFactor()) - startTime + (note.duration * this.getTimeFactor()));
  // schedule watch, score advance and keyboard light on
  Tone.getTransport().schedule((time: number) => {

    this.piano.keyDown({
      time: time,
      velocity: note.velocity,
      note: note.name,
      midi: note.midi
    });


    Tone.getDraw().schedule(() => {
      if (this.lateNotes.size > 0) {
        this.isWaiting = true;
        Tone.getTransport().pause();
      }
      if (this.isHandOk(hand)) {
        this.pushLateNote(note);
      }
      this.cursorMayBeAdvance(note);

      this.setCurrentTick(note.bars);
      if (this.isHandOk(hand) || this.zeroHand()) {
        this.noteOn(hand, note)
      }
    }, time);
  }, noteTimeStart);

  // schedule keyboard light off
  Tone.getTransport().schedule((time: number) => {

    this.piano.keyUp({
      time: time + note.duration,
      velocity: note.velocity,
      note: note.name,
      midi: note.midi
    });

    Tone.getDraw().schedule(() => {
      if (!this.isHandOk(hand)) {
        // Vérifier d'abord si la note est en attente avant la recherche DOM
        const isNoteAwaited = Array.from(this.lateNotes.values())
          .some(lateNotesList =>
            lateNotesList.some(lateNote => lateNote.note.midi === note.midi)
          );

        if (!isNoteAwaited) {
          const key = Array.from(this.keyboardElement.nativeElement
            .getElementsByClassName(`key${note.midi}`)) as HTMLElement[];
          removeNoteFromKeyboard(key);
        } else {
          this.noteOn('late', note);
        }
      }
    }, time);
  }, noteTimeEnd);

  Tone.getTransport().schedule((time: number) => {
    Tone.getDraw().schedule(() => {

      if (this.lateNotes.size > 1) {
        this.isWaiting = true;
        Tone.getTransport().pause();
      }
    }, time);
  }, Math.max(noteTimeStart - GOOD_RANGE, 0));
}


  private noteOn(hand: string, note: Note) {
  const velocityUI = Math.min(
    Math.max(Math.round(note.velocity * 10), 1),
    10
  );

  const keys = this.keyboardElement.nativeElement
    .querySelectorAll(`.key${note.midi}`) as NodeListOf<HTMLElement>;

  const classesToAdd = [`note-on-${hand}`, `note-on-${hand}-velocity-${velocityUI}`];
  keys.forEach((el: HTMLElement) => {
    el.classList.add(...classesToAdd);
  });
}


  private scheduleEnd(endTime: number) {
  Tone.getTransport().schedule(() => {
    this.spessasynth?.stopAll();
    this.message.set("END");
    this.playConfiguration.currentStave = this.playConfiguration.scoreRange[0];
    this.reset(this.playConfiguration);
    if (this.playConfiguration.isLoop) {
      this.play(this.playConfiguration);
    }
    this.lastMidiEventTime = -1;
  }, endTime + PERFECT_RANGE);
}


  private setCurrentTick(bar: number) {
  if (Math.trunc(bar) !== this.measure.getValue()) {
    this.measure.next(Math.trunc(bar));
  }
}

  private isHandOk(hand: string) {
  return (hand === 'rh' && this.playConfiguration.waitForRightHand)
    || (hand === 'lh' && this.playConfiguration.waitForLeftHand);
}


  private zeroHand() {
  return !(this.playConfiguration.waitForRightHand || this.playConfiguration.waitForLeftHand);
}

getTimeFactor() {
  return 1 / (this.playConfiguration.tempoFactor / this.playConfiguration.delayFactor);
}

calculateStartTime() {
  const startTime = (this.calculateStartTimeInMsForMeasure(
    this.playConfiguration.scoreRange[0] - 1,
    this.playConfiguration.midi!.header
  ) * this.getTimeFactor());
  return startTime;
}


calculateEndTime() {

  if (this.playConfiguration.scoreRange[1] === this.playConfiguration.maxStaveCount + 1
    && this.playConfiguration.scoreRange[0] === 1) {
    return this.duration * this.getTimeFactor();
  }
  return (this.calculateStartTimeInMsForMeasure(
    this.playConfiguration.scoreRange[1] - 1,
    this.playConfiguration.midi!.header
  ) * this.getTimeFactor());
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
  this.lateNotes = new Map<number, lateNote[]>();
  this.removeAllNotesFromKeyboard();
  this.midiPressedNotes = new Set<number>();
}


pushLateNote(note: Note) {
  if (!this.lateNotes.has(note.ticks)) {
    this.lateNotes.set(note.ticks, []);
  }
  this.lateNotes.get(note.ticks)!.push({ note: note, pressed: false });
}

  private integrateMidiEventInLastNote(midiEvent: MidiStateEvent): number {
  let success = -1;
  // Créer une copie des entrées pour éviter les problèmes de modification pendant l'itération
  const entries = Array.from(this.lateNotes.entries());

  for (const [key, notes] of entries) {
    // Itérer en sens inverse pour éviter les problèmes avec splice
    for (let idx = notes.length - 1; idx >= 0; idx--) {
      const ln = notes[idx];
      if (midiEvent.note === ln.note.midi) {
        notes.splice(idx, 1);
        this.removeMidiNoteFromKeyboard(ln.note.midi);
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

tellIfInTime(lowestKey: number) {
  console.log(this.currentTime, lowestKey, this.currentTime - lowestKey);
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
      await Tone.start();
      Tone.getTransport().start();
      this.isWaiting = false;
    }
    if (hit < 1) {
      this.message.set("BAD");
      // Reset message after a brief moment to allow effect to trigger again
      setTimeout(() => {
        this.message.set("");
      }, 10);
    }
  }
}

  private removeMidiNoteFromKeyboard(midiNote: number) {
  const keys = this.keyboardElement.nativeElement.getElementsByClassName(`key${midiNote}`);
  for (let i = 0; i < keys.length; i++) {
    clearClassesFromSVG(keys[i] as HTMLElement, "note-on");
  }
}

  private removeAllNotesFromKeyboard() {
  const selector = ".note-on-lh, .note-on-rh, .note-on-late";
  const keys = Array.from(this.keyboardElement.nativeElement.querySelectorAll(selector)) as HTMLElement[];
  keys.forEach((el: HTMLElement) => {
    clearClassesFromSVG(el, "note-on");
  });
}

/**
 * Nettoie les ressources du service, notamment l'interval du compteur de temps
 */
cleanup() {
  if (this.timeCounterInterval) {
    clearInterval(this.timeCounterInterval);
    this.timeCounterInterval = undefined;
  }
  if (this.midiFnHandle) {
    this.midiService.unsubscribe(this.midiFnHandle);
  }
}
}


function clearClassesFromSVG(el: HTMLElement, str: string) {
  const classList = el.classList;
  const classesToRemove: string[] = [];
  for (let i = 0; i < classList.length; i++) {
    if (classList[i].startsWith(str)) {
      classesToRemove.push(classList[i]);
    }
  }
  classesToRemove.forEach(className => classList.remove(className));
}


function removeNoteFromKeyboard(keys: HTMLElement[]) {
  keys.forEach((el: HTMLElement) => {
    clearClassesFromSVG(el, "note-on");
  });
}

