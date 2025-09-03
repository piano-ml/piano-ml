import { type ElementRef, Injectable } from '@angular/core';
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
const PERFECT_RANGE = 0.05

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
  public message = new BehaviorSubject<string>("");


  isWaiting = false
  currentTime = 0;
  playConfiguration!: PlayConfiguration;
  midiFnHandle?: (e: MidiStateEvent) => void;
  synth: Tone.Synth<Tone.SynthOptions>;
  soundFontArrayBuffer!: ArrayBuffer;
  spessasynth?: Synthetizer;

  midiPressedNotes: Set<number> = new Set<number>();
  lateNotes: Map<number, lateNote[]> = new Map<number, lateNote[]>();
  piano: any;
  lastMidiEventTime = 0;

  constructor(private midiService: MidiServiceService) {
    this.initPiano();
    this.initSoundFont();
    this.synth = new Tone.Synth().toDestination();
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

    const midiSplit = this.splitMidi(midiAll.toJSON(), study_tracks);
    playConfiguration.accompaniment = midiSplit.other;
    playConfiguration.midi = midiSplit.study;

    playConfiguration.maxStaveCount = Math.ceil(Math.max(...midiAll.tracks.map(track =>
      track.notes.length > 0 ? track.notes[track.notes.length - 1].bars : 0
    )));
    playConfiguration.scoreRange[0] = 1;
    playConfiguration.scoreRange[1] = playConfiguration.maxStaveCount;
    this.playConfiguration = playConfiguration;
    this.reset(playConfiguration);
    return playConfiguration;
  }


  splitMidi(json: Midi.MidiJSON, studies: number[]): { study: Midi.Midi, other: Midi.Midi } {
    const midiAll = new Midi.Midi();
    midiAll.fromJSON(json)
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

  setup() {
    if (this.midiFnHandle) {
      this.midiService.unsubscribe(this.midiFnHandle)
    }
    setTimeout(() => {
      this.midiFnHandle = this.midiService.subscribe((midiEvent) => this.processMidiEvent(midiEvent))
    }, 0)
  }

  initSoundFont() {
    if (this.spessasynth != null) {
      return; // already initialized
    }
    fetch("assets/soundfonts/GeneralUserGS.sf3").then(async response => {
      const sfont = await response.arrayBuffer();
      const ctx = new AudioContext();
      await ctx.audioWorklet.addModule("/assets/soundfonts/worklet_processor.min.js")
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
    this.lastMidiEventTime = 0;
    if (this.osmdCursor !== null) {
      this.osmdCursor.reset();
      for (let i = 0; i < this.playConfiguration.currentStave - 1; i++) {
        this.osmdCursor.nextMeasure();
      }
    }
  }

  async play(playConfigurations: PlayConfiguration) {
    //this.osmdCursor.previous();
    this.lastMidiEventTime = -1;
    this.resetLateNotes();
    const startOffset = this.calculateStartTime();
    const endCut = this.calculateEndTime();
    this.playConfiguration = playConfigurations;
    await Tone.start();
    this.scheduleRightHand(this.playConfiguration.midi!.tracks[0], startOffset);
    if (this.playConfiguration.midi!.tracks.length > 1) {
      this.scheduleLeftHand(this.playConfiguration.midi!.tracks[1], startOffset);
    }
    this.scheduleAccompanimentTracks(this.playConfiguration.accompaniment!, startOffset);
    this.scheduleEnd(endCut - startOffset);
    Tone.getContext().lookAhead = 0
    Tone.getTransport().start();
  }

  scheduleLeftHand(midi: Midi.Track, startTime: number) {
    for (const note of midi.notes) {
      this.scheduleNote('lh', note, startTime);
    }
  }
  scheduleRightHand(midi: Midi.Track, startTime: number) {
    for (const note of midi.notes) {
      if (note.time > startTime) {
        this.scheduleNote('rh', note, startTime);
      }
    }
  }

  private scheduleAccompanimentTracks(midiOther: Midi.Midi, startTime: number) {
    let i = 0;
    for (const track of midiOther.tracks) {
      this.spessasynth?.programChange(midiOther.tracks[i].channel, track.instrument.number);
      this.scheduleAccompanimentTrack(midiOther.tracks[i].channel, track, startTime);
      i++;
    }
  }

  private scheduleAccompanimentTrack(channel: number, track: Midi.Track, startTime: number) {
    for (const note of track.notes) {
      this.scheduleAccompanimentTrackNotes(channel, note, startTime);
    }
  }

  private scheduleAccompanimentTrackNotes(channel: number, note: Note, startOffset: number) {
    if (note.time < startOffset) return;
    if (note.midi === 0) return; // skip rest notes
    const noteStart = (note.time * this.playConfiguration.delayFactor) - startOffset;
    // note on
    Tone.getTransport().schedule(() => {
      this.spessasynth?.noteOn(channel, note.midi, Math.round(note.velocity * 127));
    }, noteStart);
    // note off
    Tone.getTransport().schedule(() => {
      this.spessasynth?.noteOff(channel, note.midi);
    }, noteStart + (note.duration * this.playConfiguration.delayFactor));
  }

  private scheduleStave(notesArray: Note[][], hand: string, startTime: number) {
    let i = 0;
    for (const notes of notesArray) {
      for (const note of notes) {
        this.scheduleNote(hand, note, startTime);
      }
      i++;
    }
  }

  private cursorMayBeAdvance(note: Note) {
    if (note.ticks > this.lastMidiEventTime) {
      this.osmdCursor.next();
    }
    let safety = 0;
    while (safety < 10 && this.osmdCursor.NotesUnderCursor().every(n => this.isSkipable(n))) {
      this.osmdCursor.next();
      safety++;
    }
    this.lastMidiEventTime = note.ticks;
  }

  isSkipable(n: OSMDNote): unknown {
    return n.isRest() || n.IsCueNote || n.NoteTie?.Notes.last() === n
  }



  private scheduleNote(hand: string, note: Note, startTime: number) {

    if (note.midi === 0) return;
    if (note.time < startTime) {
      return
    }
//    console.log("scheduleNote", note.ticks, note.name, note.midi);
    const noteTimeStart = (note.time * this.playConfiguration.delayFactor) - startTime;
    const noteTimeEnd = ((note.time * this.playConfiguration.delayFactor) - startTime + (note.duration * this.playConfiguration.delayFactor));

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
          this.pushLateNote(note, Tone.now() + GOOD_RANGE);
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
        if (this.midiPressedNotes.has(note.midi) || !this.isHandOk(hand)) {
          const key = Array.from(this.keyboardElement.nativeElement
            .getElementsByClassName(`key${note.name}`)) as HTMLElement[];
          Array.from(this.lateNotes.values()).forEach((ln) => {
            ln.forEach((lateNote) => {
              if (lateNote.note.midi === note.midi) {
                return; // if note is awaited we do not remove it
              }
            });
          });
          removeNoteFromKeyboard(key, hand);
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
    const key = Array.from(this.keyboardElement.nativeElement
      .getElementsByClassName(`key${note.name}`)) as HTMLElement[];

    [].forEach.call(key, (el: HTMLElement) => {
      el.classList.add(
        `note-on-${hand}`,
        `note-on-${hand}-velocity-${velocityUI}`
      );
    });
  }


  private scheduleEnd(endTime: number) {
    Tone.getTransport().schedule(() => {
      this.spessasynth?.stopAll();
      this.message.next("END");
    }, endTime);
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


  calculateStartTime() {
    return this.calculateStartTimeInMsForMeasure(
      this.playConfiguration.scoreRange[0],
      this.playConfiguration.midi!.header
    ) * this.playConfiguration.delayFactor;
  }


  calculateEndTime() {
    return this.calculateStartTimeInMsForMeasure(
      this.playConfiguration.scoreRange[1],
      this.playConfiguration.midi!.header
    ) * this.playConfiguration.delayFactor;
  }


  calculateStartTimeInMsForMeasure(start: number, midiHeader: Midi.Header): number {
    let timeSig: TimeSignatureEvent | undefined = midiHeader.timeSignatures[0];
    let elapsedTicks = 0;
    for (let i = 0; i < start-1; i++) {
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


  pushLateNote(note: Note, p0: number) {
    if (!this.lateNotes.has(note.ticks)) {
      this.lateNotes.set(note.ticks, []);
    }
    this.lateNotes.get(note.ticks)?.push({ note: note, pressed: false });
  }


  // is the midi event expected
  private lateNotesContainsMidiEventInFirstPosition(midiEvent: MidiStateEvent): boolean {
    const lowestKey = Math.min(...this.lateNotes.keys());
    const notes = this.lateNotes.get(lowestKey);
    return notes ? notes.map(ln => ln.note.midi).indexOf(midiEvent.note) >= 0 : false;
  }


  private integrateMidiEventInLastNote(midiEvent: MidiStateEvent) {
    const lowestKey = Math.min(...this.lateNotes.keys());
    const firstLastNotes = this.lateNotes.get(lowestKey);
    if (firstLastNotes) {
      const idx = firstLastNotes.map(ln => ln.note.midi).indexOf(midiEvent.note)
      firstLastNotes[idx].pressed = true;
      if (firstLastNotes.filter(ln => ln.pressed === false).length === 0) {
        // biome-ignore lint/complexity/noForEach: <explanation>
        firstLastNotes.forEach((ln) => {
          this.removeMidiNoteFromKeyboard(ln.note.midi);
        });
        this.lateNotes.delete(lowestKey);
        this.tellIfInTime(lowestKey)
      }
    }
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
      this.midiPressedNotes.add(midiEvent.note);
    } else {
      this.midiPressedNotes.delete(midiEvent.note);
    }

    if (this.lateNotesContainsMidiEventInFirstPosition(midiEvent)) {
      this.integrateMidiEventInLastNote(midiEvent);
    } else {
      if (midiEvent.type === 'down') {
        // todo make a function
        this.spessasynth?.noteOn(1, 1, 127);
        setTimeout(() => {
          this.spessasynth?.noteOff(1, 1);
        }, 500);
        console.log("BAD", midiEvent.note);
        this.lateNotes.forEach((notes, key) => {
          console.log("late notes", notes.map(ln => ln.note.midi));
        });

        this.message.next("BAD")

      }
    }
    if (this.lateNotes.size === 0 && this.isWaiting) {
      await Tone.start();
      Tone.getTransport().start();
      this.isWaiting = false;
    }
  }


  private removeMidiNoteFromKeyboard(midiNote: number) {
    const name = midiToPitch(midiNote);
    const key = Array.from(this.keyboardElement.nativeElement
      .getElementsByClassName(`key${name}`)) as HTMLElement[];
    removeNoteFromKeyboard(key, 'lh');
    removeNoteFromKeyboard(key, 'rh');
  }


  private removeAllNotesFromKeyboard() {
    const keys = (Array.from(this.keyboardElement.nativeElement
      .getElementsByClassName("note-on-lh")) as HTMLElement[])
      .concat(
        Array.from(this.keyboardElement.nativeElement
          .getElementsByClassName("note-on-rh")) as HTMLElement[]
      );
    [].forEach.call(keys, (el: HTMLElement) => {
      clearClassesFromSVG(el, "note-on");
    });
  }
}


function clearClassesFromSVG(el: HTMLElement, str: string) {
  const a = el.className as unknown as SVGAnimatedString
  const classes = a.baseVal
    .split(' ')
    .filter((c) => c.startsWith(str));
  [].forEach.call(classes, (c: string) => {
    el.classList.remove(c);
  });
}


function removeNoteFromKeyboard(key: HTMLElement[], hand: string) {
  // Remove note-on class name
  [].forEach.call(key, (el: HTMLElement) => {
    clearClassesFromSVG(el, `note-on-${hand}`);
  });
}

