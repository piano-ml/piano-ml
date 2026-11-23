import type { Stave, StaveNote } from "vexflow";
import type { Note } from '@tonejs/midi/dist/Note';
import type * as Midi from '@tonejs/midi';
import type { ReducedFraction } from "./reduced-fraction";

export interface lateNote {
  note: Note;
  pressed: boolean;
}

export interface UserPerformance {
  badNoteCount: number;
  runCount: number;
  tooEarlyCount: number;
  tooLateCount: number;
  perfectNoteCount: number;
  goodNoteCount: number;
}

export interface StaveAndStaveNotesPair {
  xPositionsBass: number[];
  xPositionsTreble: number[];
  staveNotesTreble: StaveNote[];
  staveNotesBass: StaveNote[];
  staveTreble: Stave;
  staveBass: Stave;
  midiNotesTreble: Array<Note[]>;
  midiNotesBass: Array<Note[]>;
}

export interface DurationDetection {
  duration: string;
  detectedDuration: number;
}


export interface PlayConfiguration {
  maxPerformanceStaveCount: number;
  maxStaveCount: number;
  currentStave: number;
  doSound: boolean;
  waitForLeftHand: boolean;
  waitForRightHand: boolean;
  /** The student plays the left hand along with the app, at tempo, assessed by timing (see hand-mode.ts). */
  alongLeftHand?: boolean;
  /** The student plays the right hand along with the app, at tempo, assessed by timing (see hand-mode.ts). */
  alongRightHand?: boolean;
  delayFactor: number;
  tempoFactor: number;  
  /** Measures played: 1-based, end exclusive ([start, end) plays start .. end - 1); a start of 0 also means the first measure. */
  scoreRange: [number, number];
  isLoop: boolean;
  staveAndStaveNotesPair: StaveAndStaveNotesPair[];
  accompaniment: Midi.Midi | null;
  midi: Midi.Midi | null;
  useMetronome: boolean;
  /** Bars of count-in before playback (COUNT_IN_BARS when not set): a setting of the metronome dialog. */
  countInBars?: number;
}



/** One cursor step (in playback order) that has notes, and the MIDI onset mapped onto it. */
export interface OsmdArrayElement {
    /** The measure of the step (0-based measure list index) */
    osmdMeasure: number;
    /** The step's cursor index: its position in OSMD's playback-order walk */
    osmdIndex: number;
    /** Only rests, tied-over notes, cue or grace notes: nothing to play */
    isSkipable: boolean;
    /** The notes' pitches, as MIDI numbers */
    osmdPitches: number[] | null;
    /** The expected pitches the MIDI onset played */
    midiPitches: number[];
    /** The MIDI onset (ticks) mapped onto the step, null when none */
    midiTicks: number | null;
}


export const MUSIC_XML_STORAGE_KEY = 'musicXMLScore';
export const MIDI_STORAGE_KEY = 'midiScore';
export const EXERCICE_INFO_KEY = 'exerciceInfo';


