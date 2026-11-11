import * as Midi from '@tonejs/midi';
import type { Note } from '@tonejs/midi/dist/Note';
import { HandDetectorService } from './hand-detector.service';

const Q = 480; // quarter note in ticks (default ppq)

/** A one-track piano MIDI: [pitch, start in quarters, length in quarters]. */
function pianoMidi(notes: [number, number, number][]): Midi.Midi {
  const midi = new Midi.Midi();
  const track = midi.addTrack();
  for (const [pitch, start, length] of notes) {
    track.addNote({ midi: pitch, ticks: start * Q, durationTicks: length * Q, velocity: 0.8 });
  }
  return midi;
}
const pitches = (notes: Note[]) => notes.map((n) => n.midi).sort((a, b) => a - b);

// Bass (C2 G2 C3) under a melody (E5 F5 G5 A5), four beats, played together
const BASS_AND_MELODY: [number, number, number][] = [
  [36, 0, 1], [43, 0, 1], [72, 0, 1],
  [36, 1, 1], [43, 1, 1], [74, 1, 1],
  [36, 2, 1], [48, 2, 1], [76, 2, 1],
  [36, 3, 1], [43, 3, 1], [77, 3, 1],
];

describe('HandDetectorService', () => {
  it('can be created from an empty MIDI file', () => {
    expect(new HandDetectorService(new Midi.Midi(), false)).toBeTruthy();
  });

  describe('without staff split', () => {
    it('gives every note to the right hand', () => {
      const midi = pianoMidi(BASS_AND_MELODY);
      const detector = new HandDetectorService(midi, false);
      const hands = detector.detectHand(midi.tracks[0].notes);
      expect(hands[0]).toHaveLength(12);
      expect(hands[1]).toEqual([]);
      expect(detector.doStaffSplit()).toBe(false);
      expect(detector.singleNoteDetectHand(midi.tracks[0].notes[0])).toBe('rh');
    });
  });

  describe('with staff split', () => {
    it('gives the bass to the left hand and the melody to the right hand', () => {
      const midi = pianoMidi(BASS_AND_MELODY);
      const detector = new HandDetectorService(midi, true);
      const hands = detector.detectHand(midi.tracks[0].notes);
      expect(pitches(hands[1])).toEqual([36, 36, 36, 36, 43, 43, 43, 48]);
      expect(pitches(hands[0])).toEqual([72, 74, 76, 77]);
    });

    it('tells the hand of a single note', () => {
      const midi = pianoMidi(BASS_AND_MELODY);
      const detector = new HandDetectorService(midi, true);
      const [low, , high] = midi.tracks[0].notes;
      expect(detector.singleNoteDetectHand(low)).toBe('lh');
      expect(detector.singleNoteDetectHand(high)).toBe('rh');
    });

    it('assigns every note to exactly one hand', () => {
      const midi = pianoMidi([
        ...BASS_AND_MELODY,
        [60, 4, 2], [64, 4, 2], [67, 4, 2], // middle C chord
        [41, 4, 2], [53, 4, 2],
        [79, 6, 0.5], [77, 6.5, 0.5], [45, 6, 1],
      ]);
      const notes = midi.tracks[0].notes;
      const hands = new HandDetectorService(midi, true).detectHand(notes);
      expect(hands[0].length + hands[1].length).toBe(notes.length);
      expect(hands[0].filter((n) => hands[1].includes(n))).toEqual([]);
    });

    it('splits a wide chord between the hands, lowest notes left', () => {
      const midi = pianoMidi([[36, 0, 2], [48, 0, 2], [76, 0, 2], [84, 0, 2]]);
      const hands = new HandDetectorService(midi, true).detectHand(midi.tracks[0].notes);
      expect(Math.max(...pitches(hands[1]))).toBeLessThan(Math.min(...pitches(hands[0])));
      expect(pitches(hands[1])).toContain(36);
      expect(pitches(hands[0])).toContain(84);
    });

    it('keeps a lone high melody in the right hand', () => {
      const midi = pianoMidi([[72, 0, 1], [74, 1, 1], [76, 2, 1], [77, 3, 1]]);
      const hands = new HandDetectorService(midi, true).detectHand(midi.tracks[0].notes);
      expect(pitches(hands[0])).toEqual([72, 74, 76, 77]);
    });

    it('notes not in the analysed track default to the right hand', () => {
      const midi = pianoMidi(BASS_AND_MELODY);
      const detector = new HandDetectorService(midi, true);
      const stray = { midi: 30, ticks: 99 * Q } as Note;
      expect(detector.singleNoteDetectHand(stray)).toBe('rh');
    });
  });

  describe('helpers', () => {
    const detector = new HandDetectorService(new Midi.Midi(), false);
    const n = (pitch: number, end = 1) => ({ ticks: 0, pitch, velo: 1, offTime: { ticks: end * Q, numerator: end, denominator: 4 } });

    it('areNotesSortedByPitchInAscOrder', () => {
      expect(detector.areNotesSortedByPitchInAscOrder([n(40), n(50), n(60)])).toBe(true);
      expect(detector.areNotesSortedByPitchInAscOrder([n(50), n(40)])).toBe(false);
    });

    it('isOctave: exactly two notes (half-open range) an octave apart', () => {
      expect(detector.isOctave([n(48), n(60)], 0, 2)).toBe(true);
      expect(detector.isOctave([n(48), n(59)], 0, 2)).toBe(false);
      expect(detector.isOctave([n(36), n(48), n(60)], 0, 3)).toBe(false);
    });

    it('findNoteCountPenalty: discourages a left hand with fewer notes, or everything in it', () => {
      const chord = [n(40), n(50), n(60)];
      expect(detector.findNoteCountPenalty(chord, 1)).toBe(5); // 1 left, 2 right
      expect(detector.findNoteCountPenalty(chord, 2)).toBe(0); // 2 left, 1 right
      expect(detector.findNoteCountPenalty(chord, 3)).toBe(10); // all left
      expect(detector.findNoteCountPenalty(chord, 0)).toBe(0); // all right
    });

    it('findDurationPenalty: rewards hands whose notes end together', () => {
      expect(detector.findDurationPenalty([n(40, 1), n(45, 1), n(60, 2), n(64, 2)], 2)).toBe(-20);
      expect(detector.findDurationPenalty([n(40, 1), n(45, 2), n(60, 2), n(64, 3)], 2)).toBe(0);
    });

    it('areOffTimesEqual and maxNoteOffTime', () => {
      expect(detector.areOffTimesEqual([n(40, 1), n(50, 1)], 0, 2)).toBe(true);
      expect(detector.areOffTimesEqual([n(40, 1), n(50, 2)], 0, 2)).toBe(false);
      expect(detector.maxNoteOffTime([n(40, 1), n(50, 3), n(60, 2)])).toBe(3 * Q);
    });
  });
});
