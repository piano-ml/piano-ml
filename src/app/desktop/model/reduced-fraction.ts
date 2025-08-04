
import type { Note } from '@tonejs/midi/dist/Note';

const MAX_DIVISION = 16; // double croche

export interface ReducedFraction {
  ticks: number;
  numerator: number;
  denominator: number;
}

export function quantizeNotes(notes: Note[], ppq: number) {
  for (const note of notes) {
    note.ticks = quantiseTick(note.ticks, ppq);
    note.durationTicks = quantiseTick(note.durationTicks, ppq);
  }
}


export function quantiseTick(tick: number, ppq: number): number {
  const quantile = ppq / 8; //  (1/4) / 8 ==> 1/32
  const r = Math.round(tick /  quantile) * quantile;
  if (r ==0) {
    return tick; // do not quantize to 0
  }
  return r
}

export function addFractions(a: ReducedFraction, b: ReducedFraction): ReducedFraction {
  return {
    ticks: a.ticks + b.ticks,
    numerator: a.numerator * b.denominator + b.numerator * a.denominator,
    denominator: a.denominator * b.denominator
  };
}



export function compareFractions(a: ReducedFraction, b: ReducedFraction): number {
  const diff = a.numerator * b.denominator - b.numerator * a.denominator;
  return diff === 0 ? 0 : diff > 0 ? 1 : -1;
}


export function subtractFractions(a: ReducedFraction, b: ReducedFraction): ReducedFraction {
  return {
    ticks: a.ticks - b.ticks,
    numerator: a.numerator * b.denominator - b.numerator * a.denominator,
    denominator: a.denominator * b.denominator
  };
}



export function reducedFractionfromTicks(ticks: number, ppq: number): ReducedFraction {  
  const f = reduction(reducedFraction(ticks, ppq*4));
  f.ticks = ticks;
  return f
}

export function reducedFraction(numerator: number, denominator: number): ReducedFraction {
  return {
    numerator,
    denominator
  } as ReducedFraction;
}

export function reduction(a: ReducedFraction): ReducedFraction {
  const tmp = gcd(a.numerator, a.denominator);
  return {
    ticks: a.ticks,
    numerator: a.numerator / tmp,
    denominator: a.denominator / tmp  
  }
}

export function gcd(a: number, b: number): number {
  if (b === 0) {
    return a;
  }
  return gcd(b, a % b);
}




