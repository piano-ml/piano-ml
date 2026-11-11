import type { Note } from '@tonejs/midi/dist/Note';
import { detectCle, detectKey, isAccentuationSuppressed } from './key-detection.service';
import { MajorKeys } from './music-theory';

/** One single-note chord per MIDI pitch, in order (a melody). */
const melody = (...midis: number[]) => midis.map((midi) => [{ midi } as Note]);

// Ascending major scales, from the tonic to its octave (semitones 2-2-1-2-2-2-1)
const scale = (tonic: number) => melody(...[0, 2, 4, 5, 7, 9, 11, 12].map((step) => tonic + step));

describe('key-detection', () => {
  describe('detectCle', () => {
    it('picks the treble clef for notes around or above middle C', () => {
      expect(detectCle(melody(60, 64, 67))).toBe('G');
    });

    it('picks the bass clef below middle C', () => {
      expect(detectCle(melody(48, 52, 55))).toBe('F');
    });

    it('averages chords too', () => {
      expect(detectCle([[{ midi: 40 } as Note, { midi: 84 } as Note]])).toBe('G'); // average 62
    });

    it('falls back to the bass clef without notes', () => {
      expect(detectCle([])).toBe('F');
      expect(detectCle()).toBe('F');
    });
  });

  describe('detectKey', () => {
    it.each([
      ['C', 60, MajorKeys.C],
      ['G', 55, MajorKeys.G],
      ['D', 62, MajorKeys.D],
      ['A', 57, MajorKeys.A],
      ['E', 64, MajorKeys.E],
      ['F', 53, MajorKeys.F],
      ['Bb', 58, MajorKeys.Bb],
      ['Eb', 63, MajorKeys.Eb],
      ['Ab', 56, MajorKeys.Ab],
    ])('recognizes a %s major scale', (_name, tonic, key) => {
      expect(detectKey(scale(tonic))).toBe(key);
    });

    it('notates B major with 5 sharps, not as Cb major (7 flats)', () => {
      expect(detectKey(scale(59))).toBe(MajorKeys.B);
    });

    it('notates the Db / C# scale as Db major (5 flats rather than 7 sharps)', () => {
      expect(detectKey(scale(61))).toBe(MajorKeys.Db);
    });

    it('defaults to C major without any semitone step', () => {
      expect(detectKey(melody(60, 62, 64))).toBe(MajorKeys.C); // whole tones only
      expect(detectKey([])).toBe(MajorKeys.C);
    });

    it('counts semitones between notes of consecutive chords', () => {
      // E->F and B->C inside chords, then a lone G: C major
      expect(detectKey([[{ midi: 64 } as Note, { midi: 71 } as Note], [{ midi: 65 } as Note, { midi: 72 } as Note], [{ midi: 67 } as Note]]))
        .toBe(MajorKeys.C);
    });
  });

  describe('isAccentuationSuppressed (accidental already in the key signature)', () => {
    it.each([
      [MajorKeys.G, 66, true], // F# in G major
      [MajorKeys.G, 61, false], // C# is not
      [MajorKeys.D, 61, true],
      [MajorKeys.F, 70, true], // Bb in F major
      [MajorKeys.F, 63, false], // Eb is not
      [MajorKeys.C, 61, false],
      [MajorKeys.C, 70, false],
      [MajorKeys.Db, 66, true], // Gb in Db major
    ])('%s major, MIDI %i: %s', (key, midi, expected) => {
      expect(isAccentuationSuppressed(key, midi)).toBe(expected);
    });

    it.each([MajorKeys.Cb, MajorKeys.Gb, MajorKeys.CSharp])(
      'keeps accidentals visible in %s major, whose signature is not in the table', (key) => {
        // An unknown signature hides nothing (it used to hide every accidental)
        expect(isAccentuationSuppressed(key, 61)).toBe(false);
      });
  });
});
