import { type ElementRef, Injectable } from '@angular/core';
import * as Tone from "tone";
// biome-ignore lint/style/useImportType: <explanation>
import * as Midi from '@tonejs/midi';
import { Note, NoteOnEvent, NoteOffEvent } from '@tonejs/midi/dist/Note';
import { Piano } from '@tonejs/piano'
import { BehaviorSubject } from 'rxjs';
import { getStaveDuration, getStaveDurationTick, } from './music-theory';
import type { PlayConfiguration, StaveAndStaveNotesPair } from '../model/model';
// biome-ignore lint/style/useImportType: <explanation>
import { MidiServiceService } from '../../shared/services/midi-service.service';
import type {  MidiStateEvent } from '../../shared/model/webmidi';
import { reducedFraction } from '../model/reduced-fraction';
import type { TimeSignatureEvent } from '@tonejs/midi/dist/Header';


interface KeyEvent {
  time?: Tone.Unit.Time;
  velocity?: number;
  note?: string;
  midi?: number;
}

const GOOD_RANGE = 600
const PERFECT_RANGE = 300

@Injectable({
  providedIn: 'root'
})
export class ScoreStateService {


  keyboardElement!: ElementRef;
  piano!: Piano;
  midiOther!: Midi.Midi;

  _xPosition = -1;
  public xPosition = new BehaviorSubject<number>(0);
  public measure = new BehaviorSubject<number>(0);
  public countdown = new BehaviorSubject<number>(0);
  public paused = new BehaviorSubject<boolean>(false);
  public message = new BehaviorSubject<string>("");

  lateNotes: Note[] = []
  isWaiting = false
  playConfiguration!: PlayConfiguration;
  midiFnHandle?: (e: MidiStateEvent) => void;
  synth: Tone.Synth<Tone.SynthOptions>;

  constructor(private midiService: MidiServiceService) {
    this.initPiano();
    this.synth = new Tone.Synth().toDestination();
    this.reset = this.reset.bind(this); 
  }

  setup() {
    if (this.midiFnHandle) {
      this.midiService.unsubscribe(this.midiFnHandle)
    }
    setTimeout(() => {
      this.midiFnHandle = this.midiService.subscribe((midiEvent) => this.processMidiEvent(midiEvent))
    }, 0)
  }

  initPiano() {
    this.piano = new Piano({
      velocities: 1
    }).toDestination();
    this.piano.load()
  }

  setKeyboardElement(nativeElementRef: ElementRef) {
    this.keyboardElement = nativeElementRef;
    this.setup();
  }

  pause() {
    Tone.getTransport().pause();
    this.removeAllNotesFromKeyboard()
  }

  async reset(playConfiguration: PlayConfiguration) {
    this.playConfiguration = playConfiguration;
    //const start = this.playConfiguration.scoreRange[0];
    Tone.getTransport().stop();
    Tone.getTransport().position = 0;
    Tone.getTransport().cancel();
    Tone.getDraw().dispose();
    Tone.getDraw().cancel();
    this.lateNotes = []
    this.paused.next(false);
    if (this.playConfiguration?.staveAndStaveNotesPair
      && this.playConfiguration?.staveAndStaveNotesPair.length >= this.playConfiguration.scoreRange[0]) {
      const xPositions = this.playConfiguration.staveAndStaveNotesPair[this.playConfiguration.scoreRange[0]]
      this.xPosition.next(Math.min(xPositions.xPositionsBass[0], xPositions.xPositionsTreeble[0]));
    } else {
      console.warn("skipping due to empty staveAndStaveNotesPair", this.playConfiguration?.staveAndStaveNotesPair.length);
    }

  }

  async play(playConfigurations: PlayConfiguration) {
    this.lateNotes = []
    this.playConfiguration = playConfigurations;
    await Tone.start();
    this.scheduleStudy(this.playConfiguration.staveAndStaveNotesPair);
    Tone.getTransport().start();
    Tone.getContext().lookAhead = 0
  }



  private scheduleStudy(staves: StaveAndStaveNotesPair[]) {
    const start = this.playConfiguration.scoreRange[0];
    const end = this.playConfiguration.scoreRange[1];
    const startOffset = this.calculateStartTimeInMsForMeasure(start, this.playConfiguration.midiHeader) * this.playConfiguration.delayFactor;
    const endCut = this.calculateStartTimeInMsForMeasure(end, this.playConfiguration.midiHeader) * this.playConfiguration.delayFactor;
    for (let i = 0; i < staves.length; i++) {
      if (i < start || i >= end) {
        continue;
      }
      this.scheduleStave(staves[i].midiNotesTreeble, staves[i].xPositionsTreeble, 'rh', startOffset);
      this.scheduleStave(staves[i].midiNotesBass, staves[i].xPositionsBass, 'lh', startOffset);
    }
    this.scheduleEnd(endCut - startOffset);
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

  private scheduleStave(notesArray: Note[][], xPositions: number[], hand: string, startTime: number) {
    let i = 0;

    for (const notes of notesArray) {
      for (const note of notes) {
        this.scheduleNote(hand, note, 0 - startTime, xPositions[i]);
      }
      i++;
    }
  }

  private scheduleEnd(endTime: number) {
    Tone.getTransport().schedule((time) => {
      this.message.next("END");
    }, endTime);

  }

  private setCurrentTick(bar: number, xPosition: number) {
    // if (this._xPosition > xPosition) {
    //   return
    // }
    this._xPosition = xPosition;
    this.xPosition.next(xPosition)
    this.measure.next(Math.trunc(bar));
  }

  private isHandOk(hand: string) {
    return (hand === 'rh' && this.playConfiguration.waitForRightHand)
      || (hand === 'lh' && this.playConfiguration.waitForLeftHand);
  }


  private zeroHand() {
    return !(this.playConfiguration.waitForRightHand && this.playConfiguration.waitForLeftHand);
  }

  private scheduleNote(hand: string, note: Note, now: number, xPosition: number) {
    //==== schedule note ON
    Tone.getTransport().schedule((time) => {
      // schedule sound on
      if (this.playConfiguration.doSound && !this.isHandOk(hand)) {
        this.piano.keyDown({
          time: time,
          velocity: note.velocity,
          note: note.name,
          midi: note.midi
        });
      }


      // schedule sound keyboard light on
      Tone.getDraw().schedule(() => {
        if (this.isHandOk(hand)) {

          const noteOn: NoteOnEvent = { ticks: note.ticks, velocity: note.velocity, midi: note.midi };
          const noteOff: NoteOffEvent = { ticks: note.ticks + note.durationTicks, velocity: note.noteOffVelocity }
          const noteClone = new Note(noteOn, noteOff, this.playConfiguration.midiHeader)
          noteClone.time = Date.now()
          this.lateNotes.push(noteClone);
        }
        this.setCurrentTick(note.bars, xPosition);
        if (this.isHandOk(hand) || this.zeroHand()) {
          this.noteOn(hand, note)
        }
      }, time);

    }, ((note.time * this.playConfiguration.delayFactor) + now));


    //==== schedule note off
    Tone.getTransport().schedule((time) => {

      // schedule piano sound key up
      if (this.playConfiguration.doSound) {
        this.piano.keyUp({
          time: time + note.duration,
          velocity: note.velocity,
          note: note.name,
          midi: note.midi
        });
      }
      // schedule keyboard light off
      Tone.getDraw().schedule(() => {

        if (this.lateNoteContains(note) && this.isHandOk(hand)) {
          this.isWaiting = true;
          Tone.getTransport().pause();
        } else {
          if (!this.lateNoteContains(note)) {
            const key = Array.from(this.keyboardElement.nativeElement
              .getElementsByClassName(`key${note.name}`)) as HTMLElement[];
            removeNoteFromKeyboard(key, hand);
          }
        }

      }, time);

    }, ((note.time * this.playConfiguration.delayFactor) + now + (note.duration * this.playConfiguration.delayFactor)));
  }

  private lateNotesContainsMidiEvent(midiEvent: MidiStateEvent): boolean {
    return this.lateNotes.map(n => n.midi).indexOf(midiEvent.note) >= 0
  }

  private lateNoteContains(note: Note): boolean {
    return this.lateNotes.map(n => n.midi).indexOf(note.midi) >= 0
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


  private async processMidiEvent(midiEvent: MidiStateEvent) {

    if (!this.playConfiguration || midiEvent.type === 'up'
      || (this.playConfiguration.waitForLeftHand === false
        && this.playConfiguration.waitForRightHand === false)
    ) {
      return
    }
    if (this.lateNotes.length === 0) {
      this.message.next("BAD")
      this.synth.triggerAttackRelease("A1", "32n");
      return
    }

    if (this.lateNotesContainsMidiEvent(midiEvent)) {
      this.removeMidiEventFromKeyboard(midiEvent)
      this.tellIfLate(midiEvent)
      this.lateNotes.splice(this.lateNotes.map(n => n.midi).indexOf(midiEvent.note), 1);
    } else {
      this.synth.triggerAttackRelease("A1", "32n");
      this.message.next("BAD")
    }

    if (this.lateNotes.length === 0 && this.isWaiting) {
      await Tone.start();
      Tone.getTransport().start();
      this.isWaiting = false;
    } else {
      for (const note of this.lateNotes) {
        const hand = note.midi > 60 ? 'rh' : 'lh';
        this.noteOn(hand, note);
      }


    }
  }
  tellIfLate(midiEvent: MidiStateEvent) {
    const expected = this.lateNotes[this.lateNotes.map(n => n.midi).indexOf(midiEvent.note)].time
    const delta = midiEvent.time - expected
    if (delta < PERFECT_RANGE) {
      this.message.next("PERFECT")
    } else if (delta < GOOD_RANGE) {
      this.message.next("GOOD")
    } else {
      this.message.next("LATE")
    }
  }

  private removeMidiEventFromKeyboard(midiEvent: MidiStateEvent) {
    const name = midiToPitch(midiEvent.note);
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

// move to theory

function midiToPitch(midi: number): string {
  const octave = Math.floor(midi / 12) - 1;
  return midiToPitchClass(midi) + octave.toString();
}

/**
 * Convert a MIDI note to a pitch class (just the pitch no octave).
 */
function midiToPitchClass(midi: number): string {
  const scaleIndexToNote = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  const note = midi % 12;
  return scaleIndexToNote[note];
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


