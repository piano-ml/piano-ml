import type { Stave, StaveNote } from "vexflow";
import type { Note } from '@tonejs/midi/dist/Note';
import type * as Midi from '@tonejs/midi';
import type { ReducedFraction } from "./reduced-fraction";

export interface StaveAndStaveNotesPair {
  xPositionsBass: number[];
  xPositionsTreeble: number[];
  staveNotesTreeble: StaveNote[];
  staveNotesBass: StaveNote[];
  staveTreeble: Stave;
  staveBass: Stave;
  midiNotesTreeble: Array<Note[]>;
  midiNotesBass: Array<Note[]>;
}

export interface DurationDetection {
  duration: string;
  detectedDuration: number;
}


export interface PlayConfiguration {
  doSound: boolean;
  waitForLeftHand: boolean;
  waitForRightHand: boolean;
  delayFactor: number;
  scoreRange: [number, number];
  isLoop: boolean;  
  staveAndStaveNotesPair: StaveAndStaveNotesPair[];
  tempo: number;
  staveWidth: number;
  timeSignature: ReducedFraction;
  fingering?: number[][];
  midiHeader: Midi.Header
}