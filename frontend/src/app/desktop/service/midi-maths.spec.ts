import type { Note } from '@tonejs/midi/dist/Note';
import {
  detectDuration,
  detectDuration2,
  getBar,
  getNoteDuration,
  getNoteDurationTicks,
  getStaveDuration,
  getStaveDurationTick,
  midiToPitch,
} from './midi-maths';

const PPQ = 480;
const FOUR_FOUR = { ticks: 0, numerator: 4, denominator: 4 };
const THREE_FOUR = { ticks: 0, numerator: 3, denominator: 4 };
const SIX_EIGHT = { ticks: 0, numerator: 6, denominator: 8 };

describe('midi-maths', () => {
  describe.each([
    ['detectDuration', detectDuration],
    ['detectDuration2', detectDuration2],
  ])('%s', (_name, detect) => {
    it.each([
      [1920, '1', 0],
      [960, '2', 0],
      [480, '4', 0],
      [240, '8', 0],
      [120, '16', 0],
      [60, '32', 0],
      [485, '4', 0], // slightly off: quantized first
    ])('%i ticks is a 1/%s note with %i dot(s)', (ticks, duration, dots) => {
      expect(detect(ticks, FOUR_FOUR, PPQ)).toEqual({ duration, dots });
    });

    it.each([
      [2880, '1', 1], // dotted whole
      [1440, '2', 1], // dotted half
      [360, '8', 1], // dotted eighth
      [720, '4', 1], // dotted quarter
      [180, '16', 1], // dotted sixteenth
    ])('%i ticks is a dotted 1/%s note', (ticks, duration, dots) => {
      expect(detect(ticks, FOUR_FOUR, PPQ)).toEqual({ duration, dots });
    });
  });

  it('snaps a 64th note to a 32nd: values are quantized to 32nds first', () => {
    expect(detectDuration2(30, FOUR_FOUR, PPQ)).toEqual({ duration: '32', dots: 0 });
  });

  it.each([
    [600, '4', 0], // quarter + 32nd: nearest is the quarter
    [780, '4', 1], // dotted quarter + 32nd (13/32): nearest is the dotted quarter
    [1200, '2', 0], // half + eighth (5/8): ties between half and dotted half, the plain value wins
  ])('rounds an irregular %i ticks to the nearest value', (ticks, duration, dots) => {
    expect(detectDuration(ticks, FOUR_FOUR, PPQ)).toEqual({ duration, dots });
  });

  describe('getBar', () => {
    it('is the bar a note starts in', () => {
      expect(getBar({ bars: 3.75 } as Note)).toBe(3);
      expect(getBar({ bars: 0 } as Note)).toBe(0);
    });

    it('is -1 for an unusable position', () => {
      vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      expect(getBar({ bars: Number.NaN } as Note)).toBe(-1);
      expect(getBar({ bars: Infinity } as Note)).toBe(-1);
    });
  });

  describe('bar and note durations', () => {
    it('seconds per bar', () => {
      expect(getStaveDuration(120, FOUR_FOUR)).toBe(2);
      expect(getStaveDuration(60, THREE_FOUR)).toBe(3);
      expect(getStaveDuration(120, SIX_EIGHT)).toBe(1.5);
    });

    it('ticks per bar', () => {
      expect(getStaveDurationTick(FOUR_FOUR, PPQ)).toBe(1920);
      expect(getStaveDurationTick(THREE_FOUR, PPQ)).toBe(1440);
      expect(getStaveDurationTick(SIX_EIGHT, PPQ)).toBe(1440);
    });

    it('ticks per note value', () => {
      expect(getNoteDurationTicks(4, FOUR_FOUR, PPQ)).toBe(480);
      expect(getNoteDurationTicks(8, FOUR_FOUR, PPQ)).toBe(240);
      expect(getNoteDurationTicks(1, FOUR_FOUR, PPQ)).toBe(1920);
    });

    it('seconds per note value', () => {
      expect(getNoteDuration(4, FOUR_FOUR, 120)).toBe(0.5);
      expect(getNoteDuration(2, FOUR_FOUR, 60)).toBe(2);
    });
  });

  it('midiToPitch spells with flats and scientific octaves', () => {
    expect([midiToPitch(60), midiToPitch(61), midiToPitch(21), midiToPitch(108), midiToPitch(70)])
      .toEqual(['C4', 'Db4', 'A0', 'C8', 'Bb4']);
  });
});
