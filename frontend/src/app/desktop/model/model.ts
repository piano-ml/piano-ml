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
  delayFactor: number;
  tempoFactor: number;  
  scoreRange: [number, number];
  isLoop: boolean;
  staveAndStaveNotesPair: StaveAndStaveNotesPair[];
  accompaniment: Midi.Midi | null;
  midi: Midi.Midi | null;  
}


export const MUSIC_XML_STORAGE_KEY = 'musicXMLScore';
export const MIDI_STORAGE_KEY = 'midiScore';
export const EXERCICE_INFO_KEY = 'exerciceInfo';