import { smithWatermanAlign, smithWatermanAlign2 } from './smith-waterman';

/**
 * A slot of the score (OSMD) with the MIDI event currently attached to it, if any.
 * `midi` is [pitches, ticks]: the alignment moves these events onto the slots whose notes match.
 */
type Slot = {
  isSkipable: boolean;
  osmdPitches: number[] | null;
  midiPitches: number[] | null;
  midiTicks: number | null;
  midiTicksDuration: number | null;
};
const slot = (osmd: number[] | null, midi?: [number[], number], isSkipable = false): Slot => ({
  isSkipable,
  osmdPitches: osmd,
  midiPitches: midi ? midi[0] : null,
  midiTicks: midi ? midi[1] : null,
  midiTicksDuration: midi ? 240 : null,
});
/** MIDI ticks attached to each slot after alignment (null = none). */
const ticks = (slots: Slot[]) => slots.map((s) => s.midiTicks);

const C = 60, D = 62, E = 64, F = 65, G = 67, FS = 66;

describe.each([
  ['smithWatermanAlign', smithWatermanAlign],
  ['smithWatermanAlign2', smithWatermanAlign2],
])('%s', (_name, align) => {
  it('returns an empty score as is', () => {
    const empty: Slot[] = [];
    expect(align(empty)).toBe(empty);
  });

  it('returns the score as is without any MIDI event', () => {
    const score = [slot([C]), slot([D])];
    expect(align(score)).toBe(score);
  });

  it('returns the score as is when nothing matches', () => {
    const score = [slot([C], [[FS], 0]), slot([C], [[FS], 480])];
    expect(align(score)).toBe(score);
  });

  it('keeps events that already sit on matching slots, without mutating the input', () => {
    const score = [slot([C], [[C], 0]), slot([D], [[D], 480]), slot([E], [[E], 960])];
    const result = align(score);
    expect(ticks(result)).toEqual([0, 480, 960]);
    expect(result).not.toBe(score);
    expect(result[0]).not.toBe(score[0]);
  });

  it('moves shifted events back onto the slots whose notes they play', () => {
    // events attached one slot too late
    const score = [slot([C]), slot([D], [[C], 0]), slot([E], [[D], 480]), slot([F], [[E], 960])];
    const result = align(score);
    expect(ticks(result)).toEqual([0, 480, 960, null]);
    expect(result.map((s) => s.midiPitches)).toEqual([[0], [2], [4], null]); // pitch classes
    expect(result[0].midiTicksDuration).toBe(240);
  });

  it('matches notes whatever their octave', () => {
    const score = [slot([C + 12], [[C], 0]), slot([D - 12], [[D], 480])];
    expect(ticks(align(score))).toEqual([0, 480]);
  });

  it('orders events by time, wherever they were attached', () => {
    const score = [slot([C], [[D], 480]), slot([D], [[C], 0])];
    expect(ticks(align(score))).toEqual([0, 480]);
  });

  it('never attaches an event to a skippable slot (rest, tied note), and keeps the flag', () => {
    const score = [slot([C], [[C], 0]), slot(null, undefined, true), slot([D], [[D], 480])];
    const result = align(score);
    expect(ticks(result)).toEqual([0, null, 480]);
    expect(result.map((s) => s.isSkipable)).toEqual([false, true, false]);
  });

  it('matches a chord played with a missing note (partial match)', () => {
    const score = [slot([C, E, G]), slot([D], [[C, E], 0]), slot([E], [[D], 480])];
    expect(ticks(align(score))).toEqual([0, 480, null]);
  });

  it('keeps a wrong note in its slot when the surrounding notes match', () => {
    const score = [slot([C], [[C], 0]), slot([D], [[FS], 480]), slot([E], [[E], 960]), slot([F], [[F], 1440])];
    expect(ticks(align(score))).toEqual([0, 480, 960, 1440]);
  });

  it('uses custom scores', () => {
    // with a free gap and no reward for matches, nothing scores above 0: score returned as is
    const score = [slot([C], [[C], 0])];
    expect(align(score, { exactMatchScore: 0, partialMatchScore: 0, gapScore: 0 })).toBe(score);
  });
});

describe('with more MIDI events than score slots (an extra note was played)', () => {
  // C D E F written, C D F# E F played
  const played = (): Slot[] => [
    slot([C], [[C], 0]),
    slot([D], [[D], 480]),
    slot([E], [[FS], 720]),
    slot([F], [[E], 960]),
    slot(null, [[F], 1440], true), // fifth event sits on a skippable slot: 5 events for 4 slots
  ];

  it('smithWatermanAlign keeps the original attachment (it cannot place every event)', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const score = played();
    expect(smithWatermanAlign(score)).toBe(score);
    expect(console.warn).toHaveBeenCalled();
  });

  it('smithWatermanAlign2 aligns around the extra note and drops it', () => {
    const result = smithWatermanAlign2(played());
    expect(ticks(result)).toEqual([0, 480, 960, 1440, null]);
  });
});

describe('smithWatermanAlign2 extends the matches', () => {
  it('pairs notes before the best local match when their pitches overlap', () => {
    // the local alignment starts at E; C and D before it still overlap their events
    const score = [
      slot([C, G], [[C], 0]),
      slot([D], [[D, G], 480]),
      slot([E], [[E], 960]),
      slot([F], [[F], 1440]),
      slot([G], [[G], 1920]),
    ];
    expect(ticks(smithWatermanAlign2(score))).toEqual([0, 480, 960, 1440, 1920]);
  });

  it('leaves unmatched score slots empty instead of guessing', () => {
    const score = [slot([C], [[C], 0]), slot([D], [[D], 480]), slot([E]), slot([F]), slot([G])];
    expect(ticks(smithWatermanAlign2(score))).toEqual([0, 480, null, null, null]);
  });
});

describe('smithWatermanAlign fills the gaps between matches', () => {
  it('spreads unmatched events over the free slots, in order', () => {
    // C . . F with two unmatched events between: they land on the two slots in between
    const score = [
      slot([C], [[C], 0]),
      slot([D], [[FS + 1], 480]),
      slot([E], [[FS + 3], 720]),
      slot([F], [[F], 960]),
      slot([G], [[G], 1440]),
    ];
    expect(ticks(smithWatermanAlign(score))).toEqual([0, 480, 720, 960, 1440]);
  });
});
