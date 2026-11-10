import type { Note } from '@tonejs/midi/dist/Note';
import { Stave, StaveNote } from 'vexflow';
import type { StaveAndStaveNotesPair } from '../model/model';
import { fillRests, fillWithRest } from './rest-filler';

const PPQ = 480;
const FOUR_FOUR = { ticks: 0, numerator: 4, denominator: 4 };
const BAR = 1920; // ticks in a 4/4 bar

const stave = (measure = 0) => new Stave(0, 0, 300).setMeasure(measure);
const note = (ticks: number, durationTicks = 480) => ({ ticks, durationTicks, duration: durationTicks / 960 }) as Note;
const staveNote = () => new StaveNote({ keys: ['c/4'], duration: '4' });

/** Bar content as "4" (quarter note) / "4r" (quarter rest)... */
const describeBar = (notes: StaveNote[]) => notes.map((n) => `${n.getDuration()}${n.isRest() ? 'r' : ''}`);

describe('rest-filler', () => {
  it('fills an empty bar with a centered whole rest', () => {
    const notes: StaveNote[] = [];
    const chords: Note[][] = [];
    fillWithRest(stave(), notes, chords, FOUR_FOUR, PPQ);
    expect(describeBar(notes)).toEqual(['1r']);
    expect(chords).toEqual([[]]);
  });

  it('adds nothing when the notes follow each other from the start of the bar', () => {
    const notes = [staveNote(), staveNote()];
    const chords = [[note(0)], [note(480)]];
    fillWithRest(stave(), notes, chords, FOUR_FOUR, PPQ);
    expect(describeBar(notes)).toEqual(['4', '4']);
  });

  it('puts a rest before a note that starts late in the bar', () => {
    const notes = [staveNote()];
    const chords = [[note(480)]];
    fillWithRest(stave(), notes, chords, FOUR_FOUR, PPQ);
    expect(describeBar(notes)).toEqual(['4r', '4']);
    expect(chords).toEqual([[], [note(480)]]); // chords stay aligned with stave notes
  });

  it('puts rests in every gap, with the right value (half rest, dotted rest...)', () => {
    const notes = [staveNote(), staveNote()];
    const chords = [[note(0)], [note(1440)]]; // quarter, half-note gap, quarter
    fillWithRest(stave(), notes, chords, FOUR_FOUR, PPQ);
    expect(describeBar(notes)).toEqual(['4', '2r', '4']);
  });

  it('measures gaps from the start of the stave bar', () => {
    const notes = [staveNote()];
    const chords = [[note(3 * BAR + 960)]]; // third beat of bar 3
    fillWithRest(stave(3), notes, chords, FOUR_FOUR, PPQ);
    expect(describeBar(notes)).toEqual(['2r', '4']);
  });

  it('measures the gap from the end of the longest note of a chord', () => {
    const notes = [staveNote(), staveNote()];
    const chords = [[note(0, 480), note(0, 960)], [note(1440)]]; // chord ends at 960
    fillWithRest(stave(), notes, chords, FOUR_FOUR, PPQ);
    expect(describeBar(notes)).toEqual(['4', '4r', '4']);
  });

  it('ignores gaps shorter than a 16th (timing noise of unquantized MIDI)', () => {
    const notes = [staveNote(), staveNote()];
    const chords = [[note(0)], [note(540)]]; // a 32nd late
    fillWithRest(stave(), notes, chords, FOUR_FOUR, PPQ);
    expect(describeBar(notes)).toEqual(['4', '4']);
  });

  it('fillRests fills both hands of every bar', () => {
    const pair = (measure: number) => ({
      staveTreble: stave(measure), staveBass: stave(measure),
      staveNotesTreble: [] as StaveNote[], staveNotesBass: [staveNote()],
      midiNotesTreble: [] as Note[][], midiNotesBass: [[note(measure * BAR + 480)]],
    }) as unknown as StaveAndStaveNotesPair;
    const bars = [pair(0), pair(1)];
    fillRests(bars, FOUR_FOUR, PPQ);
    for (const bar of bars) {
      expect(describeBar(bar.staveNotesTreble)).toEqual(['1r']);
      expect(describeBar(bar.staveNotesBass)).toEqual(['4r', '4']);
    }
  });
});
