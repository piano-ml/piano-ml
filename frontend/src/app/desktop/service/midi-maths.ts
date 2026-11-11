/***
 * note durations
 */

import type { Note } from "@tonejs/midi/dist/Note";
import { quantiseTick, reducedFractionfromTicks, reduction, type ReducedFraction } from "../model/reduced-fraction";
import { flatSpelling } from "./music-theory";


/**
 * Note value closest to `tick` (quantized to a 32nd): "1" whole, "2" half, "4" quarter... with 0 or 1 dot.
 * Every candidate, plain or dotted, is compared at once: picking the closest plain value first and then
 * trying to dot it missed most dotted notes (a dotted half, 3/4, tied between half and whole and became
 * a whole note).
 */
function closestNoteValue(tick: number, ppq: number, shortest: number): { duration: string, dots: number } {
  const tickQuant = quantiseTick(tick, ppq);
  const d = reduction(reducedFractionfromTicks(tickQuant, ppq));
  if (d.numerator === 1) {
    return { duration: String(d.denominator), dots: 0 };
  }

  const goal = d.numerator / d.denominator;
  let best = { duration: '1', dots: 0, distance: Number.POSITIVE_INFINITY };
  for (let denominator = 1; denominator <= shortest; denominator *= 2) {
    // A dotted 32nd (or shorter) is below the quantization step: plain values only there
    const dotted = denominator < 32 ? [0, 1] : [0];
    for (const dots of dotted) {
      const value = (1 / denominator) * (dots ? 1.5 : 1);
      const distance = Math.abs(value - goal);
      if (distance < best.distance) {
        best = { duration: String(denominator), dots, distance };
      }
    }
  }
  return { duration: best.duration, dots: best.dots };
}

export function detectDuration(tick: number, _timeSig: ReducedFraction, ppq: number): { duration: string, dots: number } {
  return closestNoteValue(tick, ppq, 32);
}

/** Same as detectDuration, with 64th notes as candidates too. */
export function detectDuration2(tick: number, _timeSig: ReducedFraction, ppq: number): { duration: string, dots: number } {
  return closestNoteValue(tick, ppq, 64);
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
    const octave = Math.floor(midi / 12) - 1; // Calculate the octave (MIDI starts at C-1)
    return `${flatSpelling[pitchClass]}${octave}`;
  }