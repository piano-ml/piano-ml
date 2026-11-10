import { ElementRef, PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import * as Midi from '@tonejs/midi';
import type { Note } from '@tonejs/midi/dist/Note';
import type { StaveNote } from 'vexflow';
import { EngravingService } from './engraving.service';
import { MajorKeys } from './music-theory';

const Q = 480; // quarter note in ticks
const FOUR_FOUR = { ticks: 0, numerator: 4, denominator: 4 };

/** One-track MIDI from [pitch, start in quarters, length in quarters]. */
function midiFile(notes: [number, number, number][], opts: { timeSignature?: number[]; bpm?: number } = {}) {
  const midi = new Midi.Midi();
  const track = midi.addTrack();
  for (const [pitch, start, length] of notes) {
    track.addNote({ midi: pitch, ticks: start * Q, durationTicks: length * Q, velocity: 0.8 });
  }
  if (opts.timeSignature) midi.header.timeSignatures.push({ ticks: 0, timeSignature: opts.timeSignature });
  if (opts.bpm) midi.header.setTempo(opts.bpm);
  return midi;
}
const note = (midi: number, durationTicks = Q) => ({ midi, durationTicks, ticks: 0 }) as Note;
/** Modifiers of a stave note by kind, e.g. accidentals ['#'] or annotations ['1', '3']. */
const modifiers = (n: StaveNote, category: string) =>
  n.getModifiers().filter((m) => m.getCategory() === category).map((m) => (m as unknown as { type?: string; text?: string }).type ?? (m as unknown as { text: string }).text);

describe('EngravingService', () => {
  let service: EngravingService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(EngravingService);
  });

  describe('setupMidiScore', () => {
    it('quantizes the notes and reads ppq, tempo and time signatures', () => {
      const midi = midiFile([[60, 0, 1]], { timeSignature: [3, 4], bpm: 90 });
      midi.tracks[0].notes[0].ticks = 5; // slightly late
      service.setupMidiScore(midi);
      expect(midi.tracks[0].notes[0].ticks).toBe(5); // below a 32nd: kept (never snapped to 0)
      expect(service.ppq).toBe(480);
      expect(service.tempo).toBe(90);
      expect(service.timeSignatures.get(0)).toEqual({ numerator: 3, denominator: 4 });
    });

    it('assumes 60 BPM without tempo', () => {
      service.setupMidiScore(midiFile([[60, 0, 1]]));
      expect(service.tempo).toBe(60);
    });

    it('quantizes the second track too', () => {
      const midi = midiFile([[60, 0, 1]]);
      midi.addTrack().addNote({ midi: 48, ticks: 485, durationTicks: 470 });
      service.setupMidiScore(midi);
      expect([midi.tracks[1].notes[0].ticks, midi.tracks[1].notes[0].durationTicks]).toEqual([480, 480]);
    });
  });

  describe('getTimeSignature', () => {
    it('defaults to 4/4', () => {
      expect(service.getTimeSignature(0)).toEqual({ numerator: 4, denominator: 4 });
    });

    it('uses the last change at or before the tick', () => {
      const midi = midiFile([[60, 0, 1]], { timeSignature: [3, 4] });
      midi.header.timeSignatures.push({ ticks: 4 * Q * 3, timeSignature: [6, 8] });
      service.setupMidiScore(midi);
      expect(service.getTimeSignature(Q)).toEqual({ numerator: 3, denominator: 4 });
      expect(service.getTimeSignature(20 * Q)).toEqual({ numerator: 6, denominator: 8 });
    });
  });

  it('spells notes with the sharps or flats of the key', () => {
    expect(service.makeNoteNotationFromNote(MajorKeys.C, note(61))).toBe('C#/4');
    expect(service.makeNoteNotationFromNote(MajorKeys.F, note(70))).toBe('Bb/4');
    expect(service.makeNoteNotationFromNote(MajorKeys.G, note(21))).toBe('A/0');
  });

  describe('buildStaveNotes', () => {
    beforeEach(() => service.setupMidiScore(midiFile([[60, 0, 1]])));

    it('builds a chord with its duration', () => {
      const staveNote = service.buildStaveNotes([note(60), note(64), note(67)], FOUR_FOUR, 'G', MajorKeys.C);
      expect(staveNote.getKeys()).toEqual(['C/4', 'E/4', 'G/4']);
      expect(staveNote.getDuration()).toBe('4');
      expect(staveNote.isRest()).toBe(false);
    });

    it('adds the dot of a dotted note', () => {
      const staveNote = service.buildStaveNotes([note(60, 720)], FOUR_FOUR, 'G', MajorKeys.C);
      expect([staveNote.getDuration(), staveNote.getModifiers().filter((m) => m.getCategory() === 'Dot').length]).toEqual(['4', 1]);
    });

    it('shows an accidental only when the key signature does not cover it', () => {
      expect(modifiers(service.buildStaveNotes([note(66)], FOUR_FOUR, 'G', MajorKeys.C), 'Accidental')).toEqual(['#']);
      expect(modifiers(service.buildStaveNotes([note(66)], FOUR_FOUR, 'G', MajorKeys.G), 'Accidental')).toEqual([]);
      expect(modifiers(service.buildStaveNotes([note(70)], FOUR_FOUR, 'G', MajorKeys.F), 'Accidental')).toEqual([]);
      expect(modifiers(service.buildStaveNotes([note(63)], FOUR_FOUR, 'G', MajorKeys.F), 'Accidental')).toEqual(['b']);
    });

    it('keeps accidentals in a key whose signature is not in the table (Gb major)', () => {
      expect(modifiers(service.buildStaveNotes([note(66)], FOUR_FOUR, 'G', MajorKeys.Gb), 'Accidental')).toEqual(['b']);
    });

    it('adds fingering', () => {
      const staveNote = service.buildStaveNotes([note(60), note(64)], FOUR_FOUR, 'G', MajorKeys.C, [1, 3]);
      expect(modifiers(staveNote, 'Annotation')).toEqual(['1', '3']);
    });

    it('uses the bass clef for F: the same C3 sits higher on a bass staff than on a treble one', () => {
      const line = (clef: string) => service.buildStaveNotes([note(48)], FOUR_FOUR, clef, MajorKeys.C).getKeyProps()[0].line;
      expect(line('F')).toBeGreaterThan(line('G'));
      expect(line('F') - line('G')).toBe(6); // treble and bass clefs are 6 staff positions apart
    });

    it('skips zero-length notes, and returns nothing when none is left', () => {
      expect(service.buildStaveNotes([note(60, 0), note(64)], FOUR_FOUR, 'G', MajorKeys.C).getKeys()).toEqual(['E/4']);
      expect(service.buildStaveNotes([note(60, 0)], FOUR_FOUR, 'G', MajorKeys.C)).toBeNull();
    });
  });

  describe('renderScore', () => {
    let host: HTMLDivElement;
    beforeEach(() => {
      host = document.createElement('div');
      document.body.appendChild(host);
    });
    afterEach(() => host.remove());

    it('draws the MIDI file as SVG sheet music, bar by bar', () => {
      // two bars: C major melody, then a bar with a rest at the start
      service.setupMidiScore(midiFile([[60, 0, 1], [62, 1, 1], [64, 2, 1], [65, 3, 1], [67, 5, 1], [69, 6, 2]]));
      let ready = false;
      service.ready.subscribe((r) => (ready = r));
      service.renderScore(new ElementRef(host), 800);

      expect(ready).toBe(true);
      expect(host.querySelector('svg')).not.toBeNull();
      expect(service.staveAndStaveNotesPair).toHaveLength(2);
      const bar2 = service.staveAndStaveNotesPair[1].staveNotesTreble;
      expect(bar2.map((n) => `${n.getDuration()}${n.isRest() ? 'r' : ''}`)).toEqual(['4r', '4', '2']);
      expect(host.querySelectorAll('.vf-stavenote').length).toBeGreaterThanOrEqual(6);
    });

    it('splits the hands over two staves when asked', () => {
      service.setupMidiScore(midiFile([[36, 0, 4], [72, 0, 1], [74, 1, 1], [76, 2, 1], [77, 3, 1]]), true);
      service.renderScore(new ElementRef(host), 800);
      const [bar] = service.staveAndStaveNotesPair;
      expect(bar.midiNotesBass.flat().map((n) => n.midi)).toEqual([36]);
      expect(bar.midiNotesTreble.flat().map((n) => n.midi)).toEqual([72, 74, 76, 77]);
    });

    it('needs a loaded MIDI file', () => {
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
      service.renderScore(new ElementRef(host), 800);
      expect(host.querySelector('svg')).toBeNull();
      expect(service.ready.value).toBe(false);
    });

    it('does nothing during server-side rendering', () => {
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({ providers: [{ provide: PLATFORM_ID, useValue: 'server' }] });
      const server = TestBed.inject(EngravingService);
      vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      server.setupMidiScore(midiFile([[60, 0, 1]]));
      server.renderScore(new ElementRef(host), 800);
      expect(host.querySelector('svg')).toBeNull();
    });
  });
});
