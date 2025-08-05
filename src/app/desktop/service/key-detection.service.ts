import { keySignatureSharpFlats, keySpelling, MajorKeys } from "./music-theory"
import { Note } from "@tonejs/midi/dist/Note";

interface KeyData {
    key: string;
    value: number;
}

export function detectCle(chords: Note[][] = []): string {
    const middle = 60; // C4
    let sumPitch = 0;
    let count = 0;
    for (const chord of chords) {
        for (const note of chord) {
            count++;
            sumPitch += note.midi;
        }
    }
    const average = sumPitch / count;
    if (average >= middle) {
        return "G"
    } else {
        return "F"
    }

}


export function detectKey(chords: Note[][] = []): MajorKeys {
    const octave = 12;
    const counts: number[] = Array(octave).fill(0);
    for (let i = 0; i < chords.length - 1; i++) {
        const currentChord = chords[i];
        const nextChord = chords[i + 1];
        for (const note1 of currentChord) {
            for (const note2 of nextChord) {
                if (Math.abs(note1.midi - note2.midi) === 1) {
                    counts[Math.min(note1.midi, note2.midi) % octave]++;
                }
            }
        }
    }
    const keysData: KeyData[] = [
        { key: MajorKeys.Cb, value: counts[3] + counts[10] },
        { key: MajorKeys.Gb, value: counts[10] + counts[5] },
        { key: MajorKeys.Db, value: counts[5] + counts[0] },
        { key: MajorKeys.Ab, value: counts[0] + counts[7] },
        { key: MajorKeys.Eb, value: counts[7] + counts[2] },
        { key: MajorKeys.Bb, value: counts[2] + counts[9] },
        { key: MajorKeys.F, value: counts[9] + counts[4] },
        { key: MajorKeys.C, value: counts[4] + counts[11] },
        { key: MajorKeys.G, value: counts[11] + counts[6] },
        { key: MajorKeys.D, value: counts[6] + counts[1] },
        { key: MajorKeys.A, value: counts[1] + counts[8] },
        { key: MajorKeys.E, value: counts[8] + counts[3] },
        { key: MajorKeys.B, value: counts[3] + counts[10] },
        { key: MajorKeys.FSharp, value: counts[10] + counts[5] },
        { key: MajorKeys.CSharp, value: counts[5] + counts[0] }
    ];
    keysData.sort((b, a) => a.value - b.value);
    if (keysData[0].value === 0) {
        return MajorKeys.C; // no key detected, default to C
    }
    return keysData[0].key as MajorKeys;
}

export function isAccentuationSuppressed(keySignature: MajorKeys, pitch: number): boolean {
    const spell = keySpelling[keySignature][pitch % 12]
    return keySignatureSharpFlats[keySignature]?.indexOf(spell) !== -1
  }
