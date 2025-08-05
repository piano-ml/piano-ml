/***
 * note durations
 */

import type { Note } from "@tonejs/midi/dist/Note";
import { quantiseTick, reducedFractionfromTicks, reduction, type ReducedFraction } from "../model/reduced-fraction";
import { flatSpelling } from "./music-theory";


export function detectDuration(tick: number, timeSig: ReducedFraction, ppq: number): { duration: string, dots: number } {

  const tickQuant = quantiseTick(tick, ppq);
  const d = reduction(reducedFractionfromTicks(tickQuant, ppq))
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

  const tickQuant = quantiseTick(tick, ppq);
  const d = reduction(reducedFractionfromTicks(tickQuant, ppq))
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
    [1 / 64]
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
  const staveD = beatsPerMeasure * beatDuration * (4 / timeSignature.denominator);
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


export function midiToPitch(midi: number): string {
    const pitchClass = midi % 12;
    const octave = Math.floor(midi / 12) - 1; // Calcule l'octave (MIDI commence à C-1)
    return `${flatSpelling[pitchClass]}${octave}`;
  }