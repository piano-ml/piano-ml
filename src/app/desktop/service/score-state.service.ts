import { type ElementRef, Injectable } from '@angular/core';
import * as Tone from "tone";
// biome-ignore lint/style/useImportType: <explanation>
import * as Midi from '@tonejs/midi';
import type { Note } from '@tonejs/midi/dist/Note';
import { Piano } from '@tonejs/piano'
import { BehaviorSubject } from 'rxjs';
import { getStaveDuration, getStaveDurationTick, } from './music-theory';
import type { PlayConfiguration, StaveAndStaveNotesPair } from '../model/model';
// biome-ignore lint/style/useImportType: <explanation>
import { MidiServiceService } from '../../shared/services/midi-service.service';
import type { MidiStateEvent } from '../../shared/model/webmidi';
import { reducedFraction } from '../model/reduced-fraction';
import type { TimeSignatureEvent } from '@tonejs/midi/dist/Header';


interface KeyEvent {
  time?: Tone.Unit.Time;
  velocity?: number;
  note?: string;
  midi?: number;
}

const GOOD_RANGE = 0.2
const PERFECT_RANGE = 0.05

interface lateNote {
  note: Note;
  pressed: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class ScoreStateService {


  keyboardElement!: ElementRef;
  piano!: Piano;
  midiOther!: Midi.Midi;


  public xPosition = new BehaviorSubject<number>(0);
  public measure = new BehaviorSubject<number>(0);
  public countdown = new BehaviorSubject<number>(0);
  public paused = new BehaviorSubject<boolean>(false);
  public message = new BehaviorSubject<string>("");


  isWaiting = false
  currentTime = 0;
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
    this.resetLateNotes();
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
    this.resetLateNotes();
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
    const msPerTick =  60000 / (this.playConfiguration.midiHeader.tempos[0].bpm * this.playConfiguration.midiHeader.ppq);
    this.currentTime = startOffset / msPerTick;
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
    // const tempo = this.playConfiguration.midiHeader.tempos[0].bpm;
    // const timeSignature = this.playConfiguration.midiHeader.timeSignatures[0].timeSignature;
    // schedule internal clock in ticks    
    // const staveDurationMs =   getStaveDuration(tempo, reducedFraction(timeSignature[0], timeSignature[1]));
    // const staveDurationTick = getStaveDurationTick(reducedFraction(timeSignature[0], timeSignature[1]), this.playConfiguration.midiHeader.ppq);
    // const quantize = 16;
    // new Tone.Loop((time) => {
    //   this.currentTime = this.currentTime + (staveDurationTick/quantize) 
    // }, staveDurationMs / quantize).start(0);
  }

  private setCurrentTick(bar: number, xPosition: number) {
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
        if (this.lateNotes.size > 0) {
          this.isWaiting = true;
          Tone.getTransport().pause();
        }

        this.setCurrentTick(note.bars, xPosition);
        if (this.isHandOk(hand) || this.zeroHand()) {
          this.noteOn(hand, note)
        }
      }, time);


      // schedule expected notes
      Tone.getDraw().schedule(() => {
        if (this.isHandOk(hand)) {
          this.pushLateNote(note, Tone.now() + GOOD_RANGE);
        }
        if (this.lateNotes.size > 1) {
          this.isWaiting = true;
          Tone.getTransport().pause();
        }
      }, time - GOOD_RANGE);

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
        if (this.midiPressedNotes.has(note.midi) || !this.isHandOk(hand)) {
          const key = Array.from(this.keyboardElement.nativeElement
            .getElementsByClassName(`key${note.name}`)) as HTMLElement[];
          removeNoteFromKeyboard(key, hand);
        }      
      }, time);

    }, ((note.time * this.playConfiguration.delayFactor) + now + (note.duration * this.playConfiguration.delayFactor)));
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


  midiPressedNotes: Set<number> = new Set<number>();
  lateNotes: Map<number, lateNote[]> = new Map<number, lateNote[]>();

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
      if (firstLastNotes.filter(ln => ln.pressed===false).length === 0) {
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
        this.synth.triggerAttackRelease("A1", "32n");
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


