import { type ElementRef, Injectable } from '@angular/core';
import * as Tone from "tone";
// biome-ignore lint/style/useImportType: <explanation>
import * as Midi from '@tonejs/midi';
import type { Note } from '@tonejs/midi/dist/Note';
import { BehaviorSubject } from 'rxjs';
import type { PlayConfiguration, StaveAndStaveNotesPair } from '../model/model';
// biome-ignore lint/style/useImportType: <explanation>
import { MidiServiceService } from '../../shared/services/midi-service.service';
import type { MidiStateEvent } from '../../shared/model/webmidi';
import { reducedFraction } from '../model/reduced-fraction';
import type { TimeSignatureEvent } from '@tonejs/midi/dist/Header';
import { Synthetizer } from "spessasynth_lib"
import { Piano } from '@tonejs/piano'
import { getStaveDuration, getStaveDurationTick, midiToPitch } from './midi-maths';


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

  private keyboardElement!: ElementRef;
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
  soundFontArrayBuffer!: ArrayBuffer;
  spessasynth?: Synthetizer;

  midiPressedNotes: Set<number> = new Set<number>();
  lateNotes: Map<number, lateNote[]> = new Map<number, lateNote[]>();
  piano: any;

  constructor(private midiService: MidiServiceService) {
    this.initPiano();
    this.initSoundFont();
    this.synth = new Tone.Synth().toDestination();
    this.reset = this.reset.bind(this);
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
    if (this.spessasynth!=null) {
      return; // already initialized
    }
    console.log("Loading SoundFont...");
    fetch("assets/soundfonts/GeneralUserGS.sf3").then(async response => {
      const sfont = await response.arrayBuffer();
      const ctx = new AudioContext();
      await ctx.audioWorklet.addModule("/assets/soundfonts/worklet_processor.min.js")
      this.spessasynth = new Synthetizer(ctx.destination, sfont, false);
      this.spessasynth.resetControllers();
      console.log("Synth loaded!");
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
    this.paused.next(false);
    if (this.playConfiguration?.staveAndStaveNotesPair
      && this.playConfiguration?.staveAndStaveNotesPair.length >= this.playConfiguration.scoreRange[0]) {
      const xPositions = this.playConfiguration.staveAndStaveNotesPair[this.playConfiguration.scoreRange[0]]
      this.xPosition.next(Math.min(xPositions.xPositionsBass[0], xPositions.xPositionsTreble[0]));
    } else {
      console.warn("skipping due to empty staveAndStaveNotesPair", this.playConfiguration?.staveAndStaveNotesPair);
    }

  }

  async play(playConfigurations: PlayConfiguration) {

    this.resetLateNotes();
    this.playConfiguration = playConfigurations;
    await Tone.start();
    this.scheduleAccompaniment();
    this.scheduleStudy(this.playConfiguration.staveAndStaveNotesPair);
    Tone.getTransport().start();
    Tone.getContext().lookAhead = 0
  }



  private scheduleStudy(staves: StaveAndStaveNotesPair[]) {


    const startOffset =this.calculateStartTime();
    const msPerTick = 60000 / (this.playConfiguration.midi.header.tempos[0].bpm * this.playConfiguration.midi.header.ppq);
    this.currentTime = startOffset / msPerTick;
    const endCut = this.calculateEndTime();
    //this.scheduleDefaultAdvance();
    for (let i = this.playConfiguration.scoreRange[0]; i < this.playConfiguration.scoreRange[1]; i++) {
      this.scheduleStave(staves[i].midiNotesTreble, staves[i].xPositionsTreble, 'rh', startOffset);
      this.scheduleStave(staves[i].midiNotesBass, staves[i].xPositionsBass, 'lh', startOffset);

    }
    this.scheduleEnd(endCut - startOffset);
  }

  private scheduleDefaultAdvance() {
    const start = this.playConfiguration.scoreRange[0];
    const end = this.playConfiguration.scoreRange[1];

    for (let i = start; i < end; i++) {
      const elapsedTicks=0;

      const timeSigEvent = this.playConfiguration.midi.header.timeSignatures.filter((t) => t.ticks <= elapsedTicks).at(-1)
      || { timeSignature: [4, 4], ticks: 0 } as TimeSignatureEvent;
      const staveDuration = getStaveDuration(
        this.playConfiguration.midi.header.tempos[0].bpm, 
        reducedFraction(timeSigEvent.timeSignature[0], timeSigEvent.timeSignature[1])
      );
      const newXPositon = ((i+1) * this.playConfiguration.staveWidth) + 40;

      Tone.getTransport().schedule((time: number) => {
        Tone.getDraw().schedule(() => {
          if (this.xPosition.getValue() < newXPositon) {
            this.xPosition.next(newXPositon );
          }
        }, time);
      }, staveDuration * (i+1));
    }

  }


  private scheduleAccompaniment() {
    let i = 0;
    for (const track of this.midiOther.tracks) {   
      this.spessasynth?.programChange(this.midiOther.tracks[i].channel, track.instrument.number);
      this.scheduleAccompanimentTrack(this.midiOther.tracks[i].channel, track);
      i++;
    }
  }

  private scheduleAccompanimentTrack(channel: number, track: Midi.Track) {

    const startOffset = this.calculateStartTime() 
    const msPerTick = 60000 / (this.playConfiguration.midi.header.tempos[0].bpm * this.playConfiguration.midi.header.ppq);
    this.currentTime = startOffset / msPerTick;

    for (const note of track.notes) {
      this.scheduleAccompanimentTrackNotes(channel, note, startOffset);
    }
  }

  private scheduleAccompanimentTrackNotes(channel: number, note: Note, startOffset: number) {
    if (note.midi === 0) return; // skip rest notes
    const noteStart=(note.time * this.playConfiguration.delayFactor) - startOffset;
    // note on
    Tone.getTransport().schedule(() => {
      this.spessasynth?.noteOn(channel , note.midi, Math.round(note.velocity * 127));
    }, noteStart);
    // note off
    Tone.getTransport().schedule(() => {
      this.spessasynth?.noteOff(channel, note.midi);
    }, noteStart + (note.duration * this.playConfiguration.delayFactor)) ;
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


  private scheduleNote(hand: string, note: Note, now: number, xPosition: number) {
    if (note.midi === 0) return;
    if (this.playConfiguration.doSound && !this.isHandOk(hand)) {
      //this.scheduleAccompanimentTrackNotes(this.playConfiguration.midi.tracks[0].channel, note, -now)
    }
    const noteTimeStart = (note.time * this.playConfiguration.delayFactor) + now;
    const noteTimeEnd = ((note.time * this.playConfiguration.delayFactor) + now + (note.duration * this.playConfiguration.delayFactor));

      // schedule watch, score advance and keyboard light on
      Tone.getTransport().schedule((time: number) => {

        this.piano.keyDown({
          time: time,
          velocity: note.velocity,
          note: note.name,
          midi: note.midi
        });

        Tone.getDraw().schedule(() => {
        // maybe make a pause ?
        if (this.lateNotes.size > 0) {
          this.isWaiting = true;
          Tone.getTransport().pause();
          // for (const [key, value] of this.lateNotes) {
          //   console.log("late notes", key, value.map(ln => ln.note.midi));
          // }
        }
        if (this.isHandOk(hand)) {
          this.pushLateNote(note, Tone.now() + GOOD_RANGE);
        }
        // schedule score advance
        this.setCurrentTick(note.bars, xPosition);

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
        }}, time);
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


  private setCurrentTick(bar: number, newXPosition?: number) {
    if (newXPosition) {
      this.xPosition.next(newXPosition);
    } else {
      const startOfBar = 0;
      this.xPosition.next(startOfBar)
    }  
    this.measure.next(Math.trunc(bar));
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
      this.playConfiguration.midi.header
    ) * this.playConfiguration.delayFactor;
  }


  calculateEndTime() {
    return this.calculateStartTimeInMsForMeasure(
        this.playConfiguration.scoreRange[1],
        this.playConfiguration.midi.header
      )  * this.playConfiguration.delayFactor;
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
        this.spessasynth?.noteOn(1,1,127);
        setTimeout(() => {
          this.spessasynth?.noteOff(1,1);
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

