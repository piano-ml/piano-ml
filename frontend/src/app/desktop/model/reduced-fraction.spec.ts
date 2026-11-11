import type { Note } from '@tonejs/midi/dist/Note';
import {
  addFractions,
  compareFractions,
  gcd,
  quantiseTick,
  quantizeNotes,
  reducedFraction,
  reducedFractionfromTicks,
  reduction,
  subtractFractions,
} from './reduced-fraction';

const PPQ = 480; // ticks per quarter note
const f = (numerator: number, denominator: number, ticks = 0) => ({ ticks, numerator, denominator });

describe('reduced-fraction', () => {
  describe('quantiseTick', () => {
    it('snaps to the nearest 32nd note (ppq / 8)', () => {
      expect(quantiseTick(480, PPQ)).toBe(480);
      expect(quantiseTick(485, PPQ)).toBe(480);
      expect(quantiseTick(500, PPQ)).toBe(480);
      expect(quantiseTick(510, PPQ)).toBe(540);
    });

    it('never snaps a short value down to 0', () => {
      expect(quantiseTick(10, PPQ)).toBe(10);
      expect(quantiseTick(0, PPQ)).toBe(0);
    });
  });

  it('quantizeNotes snaps every note start and duration in place', () => {
    const notes = [{ ticks: 485, durationTicks: 235 }, { ticks: 962, durationTicks: 10 }] as Note[];
    quantizeNotes(notes, PPQ);
    expect(notes.map((n) => [n.ticks, n.durationTicks])).toEqual([[480, 240], [960, 10]]);
  });

  it('gcd', () => {
    expect([gcd(12, 8), gcd(7, 3), gcd(5, 0), gcd(0, 5)]).toEqual([4, 1, 5, 5]);
  });

  it('reduction divides by the greatest common divisor and keeps the ticks', () => {
    expect(reduction(f(6, 8, 720))).toEqual(f(3, 4, 720));
    expect(reduction(f(3, 7))).toEqual(f(3, 7));
  });

  it('reducedFraction builds a bare fraction', () => {
    expect(reducedFraction(3, 4)).toEqual({ numerator: 3, denominator: 4 });
  });

  it.each([
    [1920, 1, 1], // whole note
    [960, 1, 2], // half
    [480, 1, 4], // quarter
    [720, 3, 8], // dotted quarter
    [120, 1, 16], // sixteenth
  ])('reducedFractionfromTicks(%i) is %i/%i of a whole note', (ticks, numerator, denominator) => {
    expect(reducedFractionfromTicks(ticks, PPQ)).toEqual({ ticks, numerator, denominator });
  });

  it('adds and subtracts fractions and their ticks', () => {
    expect(reduction(addFractions(f(1, 4, 480), f(1, 8, 240)))).toEqual(f(3, 8, 720));
    expect(reduction(subtractFractions(f(1, 2, 960), f(1, 8, 240)))).toEqual(f(3, 8, 720));
  });

  it('compares fractions by value, whatever their denominators', () => {
    expect(compareFractions(f(1, 2), f(2, 4))).toBe(0);
    expect(compareFractions(f(3, 4), f(2, 3))).toBe(1);
    expect(compareFractions(f(1, 3), f(1, 2))).toBe(-1);
  });
});
