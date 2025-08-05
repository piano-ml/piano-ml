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
}

export interface Exercise {
    title: string;
    deckName: string;
    type: "chord" | "scale";
    advice: string;
    measure: number;
    beat: ReducedFraction;
    tempo: number;
    patternLeftHand: NoteInPattern[];
    patternRightHand: NoteInPattern[];
    octaveShift: number;
    patternSize?: number;
}



