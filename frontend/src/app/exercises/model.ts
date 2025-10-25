import type { ReducedFraction } from "../desktop/model/reduced-fraction";

export interface ChordInPattern {
    name: string,
    kind: string,
    midiStart: number
}

export interface NoteInPattern {
    note: number[];
    duration: number;
    finger?: number[];
    progression?: number; // 1: I, 4: IV, 5: V
}

export interface Exercise {
    title: string;
    deckName: string;
    type: "chord" | "scale" | "melody";
    advice: string;
    measure: number;
    beat: ReducedFraction;
    tempo: number;
    patternLeftHand: NoteInPattern[];
    patternRightHand: NoteInPattern[];
    octaveShift: number;
    patternSize?: number;
    repeat: number;
    fingeringFn?: (key: string, exercise: Exercise) => void;
}



