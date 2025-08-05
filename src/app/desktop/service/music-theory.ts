/**
 * Some elements relative to music theory.
 */

export const sharpSpelling = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

export const keys = sharpSpelling

export const flatSpelling = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];

export enum MajorKeys {
  C = "C",
  F = "F",
  Bb = "Bb",
  Eb = "Eb",
  Ab = "Ab",
  Db = "Db",
  Gb = "Gb",
  Cb = "Cb",
  G = "G",
  D = "D",
  A = "A",
  E = "E",
  B = "B",
  FSharp = "F#",
  CSharp = "C#",
}

export enum MinorKeys {
  A = 'Am',
  D = 'Dm',
  G = 'Gm',
  C = 'Cm',
  F = 'Fm',
  Bb = 'Bbm',
  Eb = 'Ebm',
  Ab = 'Abm',
  E = 'Em',
  B = 'Bm',
  FSharp = 'F#m',
  CSharp = 'C#m',
  GSharp = 'G#m',
  DSharp = 'D#m',
  ASharp = 'A#m'
};


export const keySpelling: { [key in MajorKeys]: string[] } = {
  [MajorKeys.Cb]: flatSpelling,
  [MajorKeys.Gb]: flatSpelling,
  [MajorKeys.Db]: flatSpelling,
  [MajorKeys.Ab]: flatSpelling,
  [MajorKeys.Eb]: flatSpelling,
  [MajorKeys.Bb]: flatSpelling,
  [MajorKeys.F]: flatSpelling,
  [MajorKeys.C]: sharpSpelling,
  [MajorKeys.G]: sharpSpelling,
  [MajorKeys.D]: sharpSpelling,
  [MajorKeys.A]: sharpSpelling,
  [MajorKeys.E]: sharpSpelling,
  [MajorKeys.B]: sharpSpelling,
  [MajorKeys.FSharp]: sharpSpelling,
  [MajorKeys.CSharp]: sharpSpelling,
}

export const keySignatureSharpFlats: { [key in MajorKeys]?: string[] } = {
  [MajorKeys.Db]: ["Bb", "Eb", "Ab", "Db", "Gb"],
  [MajorKeys.Ab]: ["Bb", "Eb", "Ab", "Db"],
  [MajorKeys.Eb]: ["Bb", "Eb", "Ab"],
  [MajorKeys.Bb]: ["Bb", "Eb"],
  [MajorKeys.F]: ["Bb"],
  [MajorKeys.C]: [],
  [MajorKeys.G]: ['F#'],
  [MajorKeys.D]: ["F#", "C#"],
  [MajorKeys.A]: ["F#", "C#", "G#"],
  [MajorKeys.E]: ["F#", "C#", "G#", "D#"],
  [MajorKeys.B]: ["F#", "C#", "G#", "D#", "A#"],
  [MajorKeys.FSharp]: ["F#", "C#", "G#", "D#", "A#", "E#"]
}


export interface Scale {
  kind: 'Scale',
  name: string,
  alt: string,
  pattern: number[]
}


export interface Chord {
  kind: 'Chord',
  name: string,
  alt: string,
  pattern: number[]
}

export const chords: Chord[] = [
  {
    kind: "Chord",
    name: "Major",
    alt: "",
    pattern: [0, 4, 7]
  },
  {
    kind: "Chord",
    name: "Minor",
    alt: "",
    pattern: [0, 3, 7]
  },
  {
    kind: "Chord",
    name: "Dominant 7",
    alt: "",
    pattern: [0, 4, 7, 10]
  }
]

export function getChordNote(midiStart: number, index2: number, pattern: number[]): number {
  const index = index2 - 1;
  const octaveShift = Math.floor(index / pattern.length);
  return pattern[index % pattern.length] + midiStart + (12 * octaveShift);
}

// 2 full step, 1 half step
const majorScalePattern = [2, 2, 1, 2, 2, 2, 1]
const naturalMinorScalePattern = [2, 1, 2, 2, 1, 2, 2]  // Aeolian
const harmonicMinorScalePattern = [2, 1, 2, 2, 1, 3, 1] //  Aeolian ♮7 scale
const melodicMinorScalePattern = [2, 1, 2, 2, 2, 2, 1] //  Jazz minor scale
const dorianScalePattern = [2, 1, 2, 2, 2, 1, 2] //  Dorian
const phrygianScalePattern = [1, 2, 2, 2, 1, 2, 2] //  Phrygian
const lydianScalePattern = [2, 2, 2, 1, 2, 2, 1] //  Lydian
const mixolydianScalePattern = [2, 2, 1, 2, 2, 1, 2] //  Mixolydian
const locrianScalePattern = [1, 2, 2, 1, 2, 2, 2] //  Locrian


export const scales: Scale[] = [
  {
    kind: "Scale",
    name: 'Major',
    alt: 'Ionian',
    pattern: majorScalePattern
  },
  {
    kind: "Scale",
    name: 'Natural Minor',
    alt: 'Aeolian',
    pattern: naturalMinorScalePattern
  },
  {
    kind: "Scale",
    name: 'Harmonic Minor',
    alt: 'Aeolian ♮7',
    pattern: harmonicMinorScalePattern
  },
  {
    kind: "Scale",
    name: 'Melodic Minor',
    alt: 'Jazz minor',
    pattern: melodicMinorScalePattern
  },
  {
    kind: "Scale",
    name: 'Dorian',
    alt: '',
    pattern: dorianScalePattern
  },
  {
    kind: "Scale",
    name: 'Phrygian',
    alt: '',
    pattern: phrygianScalePattern
  },
  {
    kind: "Scale",
    name: 'Lydian',
    alt: '',
    pattern: lydianScalePattern
  },
  {
    kind: "Scale",
    name: 'Mixolydian',
    alt: '',
    pattern: mixolydianScalePattern
  },
  {
    kind: "Scale",
    name: 'Locrian',
    alt: '',
    pattern: locrianScalePattern
  }
]

export function generateMajorCadence(root: number): number[][] {
  const majorChord = [0, 4, 7]; // Major triad
  const dominant7Chord = [0, 4, 7, 10]; // Dominant 7th chord

  const I = majorChord.map(interval => interval + root); // I chord
  const IV = majorChord.map(interval => interval + root + 5); // IV chord (5 semitones up)
  const V = majorChord.map(interval => interval + root + 7); // V chord (7 semitones up)
  const V7 = dominant7Chord.map(interval => interval + root + 7); // V7 chord (7 semitones up)

  return [I, IV, V, V7];
}