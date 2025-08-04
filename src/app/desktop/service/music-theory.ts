import type { Note } from "@tonejs/midi/dist/Note";
import { quantiseTick, reducedFraction, reducedFractionfromTicks, reduction, type ReducedFraction } from "../model/reduced-fraction";
import type { Chord, Scale } from "../../exercises/model";
import { TimeSignature } from "vexflow";


/***
 * note durations
 */

export function detectDuration(tick: number, timeSig: ReducedFraction, ppq: number): { duration: string, dots: number } {

    const tickQuant =  quantiseTick(tick, ppq);
    const d = reduction(reducedFractionfromTicks(tickQuant , ppq))
    if (d.numerator === 1) {  
      return { duration: String(d.denominator), dots: 0 };
    }

    const possibleValues = [
      1 / 1, // ronde
      1 / 2, // blanche
      1 / 4, // noire
      1 / 8, // croche
      1 / 16, // double croche
      1 / 32 // triple croche
    ];
  
    const possibleValueDots = [
      [1 / 1, 1 / 1 + 1 / 2],
      [1 / 2, 1 / 2 + 1 / 4],
      [1 / 4, 1 / 4 + 1 / 8],
      [1 / 8, 1 / 8 + 1 / 16],
      [1 / 16, 1 / 16 + 1 / 32],
      [1 / 32]
    ];
  
    const goal = d.numerator / d.denominator;
    const closest = possibleValues.reduce((prev, curr) => (Math.abs(curr - goal) < Math.abs(prev - goal) ? curr : prev));
    const subarray = possibleValueDots[possibleValues.indexOf(closest)];
    const closestDot = subarray.reduce((prev, curr) => (Math.abs(curr - goal) < Math.abs(prev - goal) ? curr : prev));
  
    return {
      duration: String(1 / closest),
      dots: subarray.indexOf(closestDot) 
    };
  }



  export function detectDuration2(tick: number, timeSig: ReducedFraction, ppq: number): { duration: string, dots: number } {

    const tickQuant =  quantiseTick(tick, ppq);
    const d = reduction(reducedFractionfromTicks(tickQuant , ppq))
    if (d.numerator === 1) {  
      return { duration: String(d.denominator), dots: 0 };
    }

    const possibleValues = [
      1 / 1, // ronde
      1 / 2, // blanche
      1 / 4, // noire
      1 / 8, // croche
      1 / 16, // double croche
      1 / 32, // triple croche
      1 / 64
    ];
  
    const possibleValueDots = [
      [1 / 1, 1 / 1 + 1 / 2],
      [1 / 2, 1 / 2 + 1 / 4],
      [1 / 4, 1 / 4 + 1 / 8],
      [1 / 8, 1 / 8 + 1 / 16],
      [1 / 16, 1 / 16 + 1 / 32],
      [1 / 32],
      [1/64]
    ];
    const goal = d.numerator / d.denominator;
    const closest = possibleValues.reduce((prev, curr) => (Math.abs(curr - goal) < Math.abs(prev - goal) ? curr : prev));
    const subarray = possibleValueDots[possibleValues.indexOf(closest)];
    const closestDot = subarray.reduce((prev, curr) => (Math.abs(curr - goal) < Math.abs(prev - goal) ? curr : prev));
  
    return {
      duration: String(1 / closest),
      dots: subarray.indexOf(closestDot) 
    };
  }  


export function getBar(note: Note): number {
  if (Number.isNaN(note.bars)) {
    console.warn("note.bars is NaN", note);
    return -1;
  }
  if (note.bars === Infinity) {
    console.warn("note.bars is Infinity", note);
    return -1;
  }
  return Math.trunc(note.bars);
}


export function getStaveDuration(tempo: number, timeSignature: ReducedFraction): number {
  const beatsPerMeasure = timeSignature.numerator;
  const beatDuration = 60 / tempo;
  const staveD =  beatsPerMeasure * beatDuration * (4 / timeSignature.denominator);
  return staveD;
}


export function getStaveDurationTick(timeSignature: ReducedFraction, ppq: number): number {
  const staveD = ppq * timeSignature.numerator * 4 / timeSignature.denominator;
  return staveD
}

export function getNoteDurationTicks(theoricalDuration: number, timeSignature: ReducedFraction, ppq: number): number {
  const measureDurationTick = getStaveDurationTick(timeSignature, ppq);
  return measureDurationTick / timeSignature.numerator * (timeSignature.denominator / theoricalDuration);
}

export function getNoteDuration(theoricalDuration: number, timeSignature: ReducedFraction, tempo: number): number {
  const measureDuration = getStaveDuration(tempo, timeSignature);
  return measureDuration / timeSignature.numerator * 4 / theoricalDuration;
}

/**
 * notes values
 */

export const keys = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']


export const chords: Chord[] = [
  {
    kind: "Chord",
    name: "Major",
    alt: "",
    pattern: [0, 4, 7]
  },
  {
    kind: "Chord",
    name: "Minor",
    alt: "",
    pattern: [0, 3, 7]
  },
  {
    kind: "Chord",
    name: "Dominant 7",
    alt: "",
    pattern: [0, 4, 7, 10]
  }

]

export function getChordNote(midiStart: number, index2: number, pattern: number[]): number {
    const index = index2 - 1;
  const octaveShift = Math.floor(index / pattern.length);
  return pattern[index % pattern.length] + midiStart + (12 * octaveShift);
}

const majorScalePattern = [2, 2, 1, 2, 2, 2, 1]
const naturalMinorScalePattern = [2, 1, 2, 2, 1, 2, 2]  // Aeolian
const harmonicMinorScalePattern = [2, 1, 2, 2, 1, 3, 1] //  Aeolian ♮7 scale
const melodicMinorScalePattern = [2, 1, 2, 2, 2, 2, 1] //  Jazz minor scale
const dorianScalePattern = [2, 1, 2, 2, 2, 1, 2] //  Dorian
const phrygianScalePattern = [1, 2, 2, 2, 1, 2, 2] //  Phrygian
const lydianScalePattern = [2, 2, 2, 1, 2, 2, 1] //  Lydian
const mixolydianScalePattern = [2, 2, 1, 2, 2, 1, 2] //  Mixolydian
const locrianScalePattern = [1, 2, 2, 1, 2, 2, 2] //  Locrian

export function generateMajorCadence(root: number): number[][] {
  const majorChord = [0, 4, 7]; // Major triad
  const dominant7Chord = [0, 4, 7, 10]; // Dominant 7th chord

  const I = majorChord.map(interval => interval + root); // I chord
  const IV = majorChord.map(interval => interval + root + 5); // IV chord (5 semitones up)
  const V = majorChord.map(interval => interval + root + 7); // V chord (7 semitones up)
  const V7 = dominant7Chord.map(interval => interval + root + 7); // V7 chord (7 semitones up)

  return [I, IV, V, V7];
}


export const scales: Scale[] = [
  {
    kind: "Scale",
    name: 'Major',
    alt: 'Ionian',
    pattern: majorScalePattern
  },
  {
    kind: "Scale",
    name: 'Natural Minor',
    alt: 'Aeolian',
    pattern: naturalMinorScalePattern
  },
  {
    kind: "Scale",
    name: 'Harmonic Minor',
    alt: 'Aeolian ♮7',
    pattern: harmonicMinorScalePattern
  },
  {
    kind: "Scale",
    name: 'Melodic Minor',
    alt: 'Jazz minor',
    pattern: melodicMinorScalePattern
  },
  {
    kind: "Scale",
    name: 'Dorian',
    alt: '',
    pattern: dorianScalePattern
  },
  {
    kind: "Scale",
    name: 'Phrygian',
    alt: '',
    pattern: phrygianScalePattern
  },
  {
    kind: "Scale",
    name: 'Lydian',
    alt: '',
    pattern: lydianScalePattern
  },
  {
    kind: "Scale",
    name: 'Mixolydian',
    alt: '',
    pattern: mixolydianScalePattern
  },
  {
    kind: "Scale",
    name: 'Locrian',
    alt: '',
    pattern: locrianScalePattern
  }

]


export function midiToPitch(midi: number): string {
  const pitchClass = midi % 12;
  const octave = Math.floor(midi / 12) - 1; // Calcule l'octave (MIDI commence à C-1)
  return `${keys[pitchClass]}${octave}`;
}