import type { Router } from '@angular/router';
import type { MidiJSON } from '@tonejs/midi';
import { EXERCICE_INFO_KEY, MIDI_STORAGE_KEY, MUSIC_XML_STORAGE_KEY } from '../desktop/model/model';
import { type Chord, chords, majorKeys, minorKeys, type Scale, scales } from '../desktop/service/music-theory';
import { exercises as agilityExercises } from './agility/pattern';
import { generateExerciseAsMusicXML, getWeekOfYear, loadExercice, saveExerciseToStorage } from './exercices';
import type { Exercise } from './model';
import { exercises as scaleExercises } from './scales/pattern';

/**
 * The exercise generator: a pattern (exercise) + a scale or chord + a key -> MusicXML for the score and MIDI
 * for the player, stored for the workbench. Every exercise is generated and checked against invariants.
 */
describe('exercise generator', () => {
  const MAJOR = scales.find((s) => s.name === 'Major') as Scale;
  const MINOR = scales.find((s) => s.name === 'Minor') as Scale;
  /** Circle of fifths: majorKeys and minorKeys are both listed C/Am, G/Em, ... F/Dm. */
  const FIFTHS = [0, 1, 2, 3, 4, 5, 6, -5, -4, -3, -2, -1];
  /** Sharps (+) or flats (-) of the first key signature; C major and A minor get no <key> element at all. */
  const fifths = (doc: Document) => Number(doc.querySelector('key fifths')?.textContent ?? 0);

  function parse(xml: string): Document {
    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    expect(doc.querySelector('parsererror'), 'MusicXML parses').toBeNull();
    return doc;
  }

  /**
   * Checks that no measure is overfilled: the position reached in each measure (notes advance it unless they
   * are part of a chord, <backup> moves it back, <forward> on) never passes the time signature's length.
   */
  function expectMeasuresNotOverfilled(doc: Document, where: string) {
    const divisions = Number(doc.querySelector('attributes divisions')?.textContent);
    const beats = Number(doc.querySelector('attributes time beats')?.textContent);
    const beatType = Number(doc.querySelector('attributes time beat-type')?.textContent);
    expect(divisions > 0 && beats > 0 && beatType > 0, `${where}: divisions and time signature`).toBe(true);
    const measureLength = (divisions * 4 * beats) / beatType;
    for (const part of doc.querySelectorAll('part')) {
      for (const measure of part.querySelectorAll('measure')) {
        let position = 0;
        let reached = 0;
        for (const child of measure.children) {
          const duration = Number(child.querySelector(':scope > duration')?.textContent ?? 0);
          if (child.tagName === 'note' && !child.querySelector(':scope > chord')) position += duration;
          else if (child.tagName === 'backup') position -= duration;
          else if (child.tagName === 'forward') position += duration;
          reached = Math.max(reached, position);
        }
        expect(reached, `${where}: part ${part.getAttribute('id')} measure ${measure.getAttribute('number')}`).toBeLessThanOrEqual(measureLength);
      }
    }
  }

  function expectPlayableMidi(midi: MidiJSON, where: string) {
    const [rh, lh] = midi.tracks;
    expect(midi.tracks, `${where}: one track per hand`).toHaveLength(2);
    for (const track of midi.tracks) {
      expect(track.notes.length, `${where}: notes`).toBeGreaterThan(0);
      for (const note of track.notes) {
        expect(note.midi >= 21 && note.midi <= 108, `${where}: ${note.midi} on a piano`).toBe(true);
        expect(note.time >= 0 && note.duration > 0, `${where}: timing`).toBe(true);
      }
    }
    const average = (notes: { midi: number }[]) => notes.reduce((sum, n) => sum + n.midi, 0) / notes.length;
    expect(average(lh.notes), `${where}: left hand below the right hand`).toBeLessThanOrEqual(average(rh.notes));
  }

  const STEP: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  /** MIDI numbers of the notes written in each part, in order (C4 = 60). */
  function writtenPitches(doc: Document): number[][] {
    return [...doc.querySelectorAll('part')].map((part) => [...part.querySelectorAll('note pitch')].map((pitch) =>
      (Number(pitch.querySelector('octave')?.textContent) + 1) * 12
      + STEP[pitch.querySelector('step')?.textContent ?? '']
      + Number(pitch.querySelector('alter')?.textContent ?? 0)));
  }

  /** The score shows what the player plays: each part holds exactly its MIDI track's notes. */
  function expectScoreMatchesMidi(doc: Document, midi: MidiJSON, where: string) {
    const written = writtenPitches(doc);
    const sorted = (values: number[]) => [...values].sort((a, b) => a - b);
    midi.tracks.forEach((track, i) => {
      expect(sorted(written[i] ?? []), `${where}: ${i === 0 ? 'right' : 'left'} hand score = MIDI`).toEqual(sorted(track.notes.map((n) => n.midi)));
    });
  }

  function generateAndCheck(exercise: Exercise, scaleOrChord: Scale | Chord, key: string) {
    const where = `${exercise.key} / ${scaleOrChord.name} / ${key}`;
    const midi = saveExerciseToStorage(exercise, scaleOrChord, key) as MidiJSON;
    const doc = parse(localStorage.getItem(MUSIC_XML_STORAGE_KEY) as string);
    expect(doc.querySelectorAll('part').length, `${where}: parts`).toBeGreaterThan(0);
    expect(doc.querySelectorAll('note').length, `${where}: notes`).toBeGreaterThan(0);
    expectMeasuresNotOverfilled(doc, where);
    expectPlayableMidi(midi, where);
    expectScoreMatchesMidi(doc, midi, where);
    return doc;
  }

  afterEach(() => {
    for (const key of [MUSIC_XML_STORAGE_KEY, MIDI_STORAGE_KEY, EXERCICE_INFO_KEY]) localStorage.removeItem(key);
  });

  describe('scale exercises', () => {
    for (const exercise of scaleExercises) {
      it(`generates "${exercise.key}" in every major and minor key, with the right key signature`, () => {
        majorKeys.forEach((key, i) => {
          const doc = generateAndCheck(exercise, MAJOR, key);
          expect(fifths(doc), `${exercise.key} in ${key}`).toBe(FIFTHS[i]);
        });
        minorKeys.forEach((key, i) => {
          const doc = generateAndCheck(exercise, MINOR, key);
          expect(fifths(doc), `${exercise.key} in ${key}`).toBe(FIFTHS[i]);
          if (FIFTHS[i] !== 0) expect(doc.querySelector('key mode')?.textContent, `${exercise.key} in ${key}`).toBe('minor');
        });
      });
    }

    it('generates every exercise in every other scale (modes, harmonic and melodic minor...)', () => {
      for (const scale of scales.filter((s) => s !== MAJOR && s !== MINOR)) {
        for (const exercise of scaleExercises) generateAndCheck(exercise, scale, 'D');
      }
    });
  });

  describe('chord exercises (agility)', () => {
    for (const exercise of agilityExercises) {
      it(`generates "${exercise.key}" for its chords in every key`, () => {
        const fitting = chords.filter((chord) => chord.pattern.length === exercise.patternSize);
        expect(fitting.length).toBeGreaterThan(0);
        for (const chord of fitting) {
          for (const key of majorKeys) generateAndCheck(exercise, chord, key);
        }
      });
    }
  });

  describe('storage for the workbench', () => {
    it('stores the score, the MIDI and what the exercise is', () => {
      const exercise = scaleExercises[0];
      const midi = saveExerciseToStorage(exercise, MAJOR, 'G');
      expect(JSON.parse(localStorage.getItem(MIDI_STORAGE_KEY) as string)).toEqual(JSON.parse(JSON.stringify(midi)));
      expect(localStorage.getItem(MUSIC_XML_STORAGE_KEY)).toBe(generateExerciseAsMusicXML(exercise, MAJOR, 'G'));
      expect(JSON.parse(localStorage.getItem(EXERCICE_INFO_KEY) as string)).toEqual({ title: exercise.title, tonic: 'G', mode: 'Major', kind: 'Scale' });
    });

    it('names the score after the exercise', () => {
      const doc = parse(generateExerciseAsMusicXML(scaleExercises[0], MAJOR, 'C'));
      expect(doc.documentElement.textContent).toContain(scaleExercises[0].title);
    });
  });

  describe('opening an exercise in the workbench', () => {
    const router = () => ({ navigate: vi.fn() }) as unknown as Router & { navigate: ReturnType<typeof vi.fn> };

    it('opens a scale exercise at /workbench/scale/<scale>/<key>/<exercise> with the metronome on', () => {
      const r = router();
      const exercise = scaleExercises.find((e) => e.key === 'contrary_motion') as Exercise;
      loadExercice(r, exercise, scales.find((s) => s.name === 'Harmonic Minor') as Scale, 'A');
      expect(r.navigate).toHaveBeenCalledWith(['/', 'workbench', 'scale', 'harmonic_minor', 'A', 'contrary_motion'], {
        state: { fromStorage: true },
        queryParams: { useMetronome: 'true' },
      });
      expect(localStorage.getItem(MIDI_STORAGE_KEY)).toBeTruthy();
    });

    it('opens a chord exercise at /workbench/agility/<chord>/<key>/<exercise>', () => {
      const r = router();
      const exercise = agilityExercises[0];
      loadExercice(r, exercise, chords.find((c) => c.name === 'Major') as Chord, 'Eb');
      expect(r.navigate).toHaveBeenCalledWith(['/', 'workbench', 'agility', 'major', 'Eb', exercise.key], expect.objectContaining({ state: { fromStorage: true } }));
    });

    it('builds the URL keys from the names when an exercise or scale has no key', () => {
      const r = router();
      const exercise = { ...scaleExercises[0], key: undefined, title: 'Hands & Fingers: Étude' } as Exercise;
      loadExercice(r, exercise, { ...MAJOR, key: undefined, name: 'Ionian Mode' }, 'C');
      expect(r.navigate.mock.calls[0][0]).toEqual(['/', 'workbench', 'scale', 'ionian_mode', 'C', 'hands_and_fingers_etude']);
    });
  });

  describe('the key of the week', () => {
    afterEach(() => vi.useRealTimers());

    it('counts the weeks since January 1st', () => {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date(2026, 0, 1, 12));
      expect(getWeekOfYear()).toBe(0);
      vi.setSystemTime(new Date(2026, 0, 8, 12));
      expect(getWeekOfYear()).toBe(1);
      vi.setSystemTime(new Date(2026, 11, 31, 12));
      expect(getWeekOfYear()).toBe(52);
    });
  });
});
