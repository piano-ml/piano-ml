import { reducedFraction } from "../../desktop/model/reduced-fraction";
import type { Exercise } from "../model";




function scaleFingering(key: string, exercise: Exercise): void {
    const whiteKeys = ['C', 'D', 'E', 'F', 'G', 'A', 'B', 'a', 'e', 'b', 'f', 'c', 'g', 'd'];
    const blackKeys = ['C#', 'Db', 'D#', 'Eb', 'F#', 'Gb', 'G#', 'Ab', 'A#', 'Bb', "f#", "c#", "g#", "d#", "bb"];

    // Normalize the root note (remove octave numbers)
    const rootNote = key.replace(/[0-9]/g, '');

    const isWhiteKey = whiteKeys.includes(rootNote);
    const isBlackKey = blackKeys.includes(rootNote);

    if (!isWhiteKey && !isBlackKey) return;

    let patternRH: number[] = [];
    let patternLH: number[] = [];

    // Right Hand Fingering
    if (isWhiteKey) {
        patternRH = [1, 2, 3, 1, 2, 3, 4, 1, 2, 3, 1, 2, 3, 4, 5, 4, 3, 2, 1, 3, 2, 1, 4, 3, 2, 1, 3, 2, 1];
        patternLH = [5, 4, 3, 2, 1, 3, 2, 1, 4, 3, 2, 1, 3, 2, 1, 2, 3, 1, 2, 3, 4, 1, 2, 3, 1, 2, 3, 4, 5];
        if (rootNote === 'F') {
            patternRH = [1, 2, 3, 4, 1, 2, 3, 1, 2, 3, 4, 1, 2, 3, 4, 3, 2, 1, 4, 3, 2, 1, 3, 2, 1, 4, 3, 2, 1];
        }
        if (rootNote === 'B') {
            patternLH = [4, 3, 2, 1, 4, 3, 2, 1, 3, 2, 1, 4, 3, 2, 1, 2, 3, 4, 1, 2, 3, 1, 2, 3, 4, 1, 2, 3, 4];
        }
    } else {
        switch (rootNote) {
            case 'C#':
            case 'Db':
                patternRH = [2, 3, 1, 2, 3, 4, 1, 2, 3, 1, 2, 3, 4, 1, 2, 1, 4, 3, 2, 1, 3, 2, 1, 4, 3, 2, 1, 3, 2];
                patternLH = [3, 2, 1, 4, 3, 2, 1, 3, 2, 1, 4, 3, 2, 1, 2, 1, 2, 3, 4, 1, 2, 3, 1, 2, 3, 4, 1, 2, 3];
                break;
            case 'D#':
            case 'Eb':
                patternRH = [2, 1, 2, 3, 4, 1, 2, 3, 1, 2, 3, 4, 1, 2, 3, 2, 1, 4, 3, 2, 1, 3, 2, 1, 4, 3, 2, 1, 2];
                patternLH = [3, 2, 1, 4, 3, 2, 1, 3, 2, 1, 4, 3, 2, 1, 2, 1, 2, 4, 4, 1, 2, 3, 1, 2, 3, 4, 1, 2, 3];
                break;
            case 'F#':
            case 'Gb':
                patternRH = [2, 3, 4, 1, 2, 3, 1, 2, 3, 4, 1, 2, 3, 1, 2, 1, 3, 2, 1, 4, 3, 2, 1, 3, 2, 1, 4, 3, 2];
                patternLH = [4, 3, 2, 1, 3, 2, 1, 4, 3, 2, 1, 3, 2, 1, 2, 1, 2, 3, 1, 2, 3, 4, 1, 2, 3, 1, 2, 3, 4];
                break;
            case 'Ab':
            case 'G#':
                patternRH = [2, 3, 1, 2, 3, 1, 2, 3, 4, 1, 2, 3, 1, 2, 3, 2, 1, 3, 2, 1, 4, 3, 2, 1, 3, 2, 1, 3, 2];
                patternLH = [3, 2, 1, 4, 3, 2, 1, 3, 2, 1, 4, 3, 2, 1, 2, 1, 2, 3, 4, 1, 2, 3, 1, 2, 3, 4, 1, 2, 3];
                break;
            case 'Bb':
            case 'A#':
                patternRH = [2, 1, 2, 3, 1, 2, 3, 4, 1, 2, 3, 1, 2, 3, 4, 3, 2, 1, 3, 2, 1, 4, 3, 2, 1, 3, 2, 1, 2];
                patternLH = [3, 2, 1, 4, 3, 2, 1, 3, 2, 1, 4, 3, 2, 1, 2, 1, 2, 3, 4, 1, 2, 3, 1, 2, 3, 4, 1, 2, 3];
                break;
        }
    }

    // patch exercice with patterns
    // RH
    exercise.patternRightHand.forEach((note, i) => {
        if (note.note[0] !== 0) { // Skip rests
            note.finger = [patternRH[i % patternRH.length]];
        }
    });
    // LH
    exercise.patternLeftHand.forEach((note, i) => {
        if (note.note[0] !== 0) { // Skip rests
            note.finger = [patternLH[i % patternLH.length]];
        }
    });
}
/**
 * C Major shift -1
 * D Major shift -1
 * E -Major shift -1
 * F# Major shift -2
 * G Major shift -2
 * A -Major shift -2
 * B Major shift -2
 */
const exercice2: Exercise = {
    title: "Parallel motion in octaves",
    deckName: "Awesome Hamilton",
    type: "scale",
    advice: "LH: 4th finger on 2nd degree of scale, RH; 4th finger on 7th degree of scale.",
    measure: 4,
    beat: reducedFraction(4, 4),
    tempo: 60,
    octaveShift: 0,
    repeat: 1,
    fingeringFn: scaleFingering,
    patternRightHand: [
        // ================= 1
        { note: [1], duration: 8, finger: [1] },
        { note: [2], duration: 8, finger: [2] },
        { note: [3], duration: 8, finger: [3] },
        { note: [4], duration: 8, finger: [1] },
        { note: [5], duration: 8, finger: [2] },
        { note: [6], duration: 8, finger: [3] },
        { note: [7], duration: 8, finger: [4] },
        { note: [8], duration: 8, finger: [1] },
        // ================= 2
        { note: [9], duration: 8, finger: [2] },
        { note: [10], duration: 8, finger: [3] },
        { note: [11], duration: 8, finger: [1] },
        { note: [12], duration: 8, finger: [2] },
        { note: [13], duration: 8, finger: [3] },
        { note: [14], duration: 8, finger: [4] },
        { note: [15], duration: 8, finger: [5] },
        { note: [14], duration: 8, finger: [4] },
        // ================= 2
        { note: [13], duration: 8, finger: [3] },
        { note: [12], duration: 8, finger: [2] },
        { note: [11], duration: 8, finger: [1] },
        { note: [10], duration: 8, finger: [3] },
        { note: [9], duration: 8, finger: [3] },
        { note: [8], duration: 8, finger: [1] },
        { note: [7], duration: 8, finger: [4] },
        { note: [6], duration: 8, finger: [3] },
        // ================= 2
        { note: [5], duration: 8, finger: [1] },
        { note: [4], duration: 8, finger: [1] },
        { note: [3], duration: 8, finger: [3] },
        { note: [2], duration: 8, finger: [2] },
        { note: [1], duration: 2, finger: [1] },
    ],
    patternLeftHand: [
        // ================= 1
        { note: [1], duration: 8, finger: [5] },
        { note: [2], duration: 8, finger: [4] },
        { note: [3], duration: 8, finger: [3] },
        { note: [4], duration: 8, finger: [2] },
        { note: [5], duration: 8, finger: [1] },
        { note: [6], duration: 8, finger: [3] },
        { note: [7], duration: 8, finger: [2] },
        { note: [8], duration: 8, finger: [1] },
        // ================= 2
        { note: [9], duration: 8, finger: [4] },
        { note: [10], duration: 8, finger: [3] },
        { note: [11], duration: 8, finger: [2] },
        { note: [12], duration: 8, finger: [1] },
        { note: [13], duration: 8, finger: [3] },
        { note: [14], duration: 8, finger: [2] },
        { note: [15], duration: 8, finger: [1] },
        { note: [14], duration: 8, finger: [2] },
        // ================= 2
        { note: [13], duration: 8, finger: [3] },
        { note: [12], duration: 8, finger: [1] },
        { note: [11], duration: 8, finger: [2] },
        { note: [10], duration: 8, finger: [3] },
        { note: [9], duration: 8, finger: [4] },
        { note: [8], duration: 8, finger: [1] },
        { note: [7], duration: 8, finger: [2] },
        { note: [6], duration: 8, finger: [3] },
        // ================= 2
        { note: [5], duration: 8, finger: [1] },
        { note: [4], duration: 8, finger: [2] },
        { note: [3], duration: 8, finger: [3] },
        { note: [2], duration: 8, finger: [4] },
        { note: [1], duration: 2, finger: [5] },
    ]

}

const exercice1: Exercise = {
    title: "Left than Right",
    deckName: "Furious Shirley",
    type: "scale",
    advice: "Thumb (1) cross under 3. Both thumbs plays the same note. Up then down.",
    measure: 4,
    beat: reducedFraction(4, 4),
    tempo: 60,
    octaveShift: 0,
    repeat: 1,
    fingeringFn: scaleFingering,    
    patternRightHand: [
        // ================= 1
        { note: [0], duration: 4, },
        { note: [0], duration: 4 },
        { note: [0], duration: 4 },
        { note: [0], duration: 4 },
        { note: [0], duration: 4 },
        { note: [0], duration: 4 },
        { note: [0], duration: 4 },
        { note: [0], duration: 4 },
        // ================= 1      
        { note: [1], duration: 4, finger: [1] },
        { note: [2], duration: 4, finger: [2] },
        { note: [3], duration: 4, finger: [3] },
        { note: [4], duration: 4, finger: [1] },
        { note: [5], duration: 4, finger: [2] },
        { note: [6], duration: 4, finger: [3] },
        { note: [7], duration: 4, finger: [4] },
        { note: [8], duration: 4, finger: [5] },
        // ================= 2
        { note: [8], duration: 4, finger: [5] },
        { note: [7], duration: 4, finger: [4] },
        { note: [6], duration: 4, finger: [3] },
        { note: [5], duration: 4, finger: [2] },
        { note: [4], duration: 4, finger: [1] },
        { note: [3], duration: 4, finger: [3] },
        { note: [2], duration: 4, finger: [2] },
        { note: [1], duration: 4, finger: [1] },
        // { note: [0], duration: 4, finger: [] },
        // // ================= 2
        { note: [0], duration: 4, },
        { note: [0], duration: 4, },
        { note: [0], duration: 4, },
        { note: [0], duration: 4, },
        { note: [0], duration: 4, },
        { note: [0], duration: 4, },
        { note: [0], duration: 4, },
        { note: [0], duration: 4, },
    ],
    patternLeftHand: [
        // // ================= 1
        { note: [1], duration: 4, finger: [5] },
        { note: [2], duration: 4, finger: [4] },
        { note: [3], duration: 4, finger: [3] },
        { note: [4], duration: 4, finger: [2] },
        { note: [5], duration: 4, finger: [1] },
        { note: [6], duration: 4, finger: [3] },
        { note: [7], duration: 4, finger: [2] },
        { note: [8], duration: 4, finger: [1] },
        // ================= 2
        { note: [0], duration: 4, },
        { note: [0], duration: 4, },
        { note: [0], duration: 4, },
        { note: [0], duration: 4, },
        { note: [0], duration: 4, },
        { note: [0], duration: 4, },
        { note: [0], duration: 4, },
        { note: [0], duration: 4, },
        // ================= 3
        { note: [0], duration: 4, },
        { note: [0], duration: 4, },
        { note: [0], duration: 4, },
        { note: [0], duration: 4, },
        { note: [0], duration: 4, },
        { note: [0], duration: 4, },
        { note: [0], duration: 4, },
        { note: [0], duration: 4, },
        // // ================= 4
        { note: [8], duration: 4, finger: [1] },
        { note: [7], duration: 4, finger: [2] },
        { note: [6], duration: 4, finger: [3] },
        { note: [5], duration: 4, finger: [4] },
        { note: [4], duration: 4, finger: [5] },
        { note: [3], duration: 4, finger: [1] },
        { note: [2], duration: 4, finger: [2] },
        { note: [1], duration: 4, finger: [3] },
    ]
}

const exercice3: Exercise = {
    title: "Intervals",
    deckName: "Awesome Hamilton",
    type: "scale",
    advice: "LH: 4th finger on 2nd degree of scale, RH; 4th finger on 7th degree of scale.",
    measure: 6,
    beat: reducedFraction(4, 4),
    tempo: 60,
    octaveShift: 0,
    repeat: 1,
    patternRightHand: [],
    patternLeftHand: []
}

// Fonction pour générer le pattern d'une étape spécifique
function generateStepPattern(stepNumber: number) {
    const baseNote = stepNumber; // Step 1 = note 1, Step 2 = note 2, etc.

    const rightHandPattern = [
        // Série d'intervalles croissants
        { note: [baseNote], duration: 4, finger: [1] },
        { note: [baseNote + 1], duration: 4, finger: [2] },
        { note: [baseNote], duration: 4, finger: [1] },
        { note: [baseNote + 2], duration: 4, finger: [3] },
        { note: [baseNote], duration: 4, finger: [1] },
        { note: [baseNote + 3], duration: 4, finger: [4] },
        { note: [baseNote], duration: 4, finger: [1] },
        { note: [baseNote + 4], duration: 4, finger: [5] },
        { note: [baseNote], duration: 4, finger: [1] },
        { note: [baseNote + 5], duration: 4, finger: [1] },
        { note: [baseNote], duration: 4, finger: [1] },
        { note: [baseNote + 6], duration: 4, finger: [5] },
        { note: [baseNote], duration: 4, finger: [1] },
        { note: [baseNote + 7], duration: 4, finger: [5] },
        // Série d'accords descendants
        { note: [baseNote, baseNote + 7], duration: 4, finger: [1] },
        { note: [baseNote, baseNote + 6], duration: 4, finger: [1] },
        { note: [baseNote, baseNote + 5], duration: 4, finger: [1] },
        { note: [baseNote, baseNote + 4], duration: 4, finger: [1] },
        { note: [baseNote, baseNote + 3], duration: 4, finger: [1] },
        { note: [baseNote, baseNote + 2], duration: 4, finger: [1] },
        { note: [baseNote, baseNote + 1], duration: 4, finger: [1] },
        { note: [baseNote], duration: 4, finger: [1] },
        { note: [baseNote, baseNote + 7], duration: 2, finger: [1, 5] },
        // Silences
        { note: [0], duration: 1 },
        { note: [0], duration: 1 },
        { note: [0], duration: 1 },
        { note: [0], duration: 1 },
        { note: [0], duration: 1 },
        { note: [0], duration: 1 }
    ];

    const leftHandPattern = [
        // Silences au début
        { note: [0], duration: 1 },
        { note: [0], duration: 1 },
        { note: [0], duration: 1 },
        { note: [0], duration: 1 },
        { note: [0], duration: 1 },
        { note: [0], duration: 1 },
        // Série d'intervalles croissants
        { note: [baseNote], duration: 4, finger: [1] },
        { note: [baseNote + 1], duration: 4, finger: [2] },
        { note: [baseNote], duration: 4, finger: [1] },
        { note: [baseNote + 2], duration: 4, finger: [3] },
        { note: [baseNote], duration: 4, finger: [1] },
        { note: [baseNote + 3], duration: 4, finger: [4] },
        { note: [baseNote], duration: 4, finger: [1] },
        { note: [baseNote + 4], duration: 4, finger: [5] },
        { note: [baseNote], duration: 4, finger: [1] },
        { note: [baseNote + 5], duration: 4, finger: [1] },
        { note: [baseNote], duration: 4, finger: [1] },
        { note: [baseNote + 6], duration: 4, finger: [5] },
        { note: [baseNote], duration: 4, finger: [1] },
        { note: [baseNote + 7], duration: 4, finger: [5] },
        // Série d'accords descendants
        { note: [baseNote, baseNote + 7], duration: 4, finger: [1] },
        { note: [baseNote, baseNote + 6], duration: 4, finger: [1] },
        { note: [baseNote, baseNote + 5], duration: 4, finger: [1] },
        { note: [baseNote, baseNote + 4], duration: 4, finger: [1] },
        { note: [baseNote, baseNote + 3], duration: 4, finger: [1] },
        { note: [baseNote, baseNote + 2], duration: 4, finger: [1] },
        { note: [baseNote, baseNote + 1], duration: 4, finger: [1] },
        { note: [baseNote], duration: 4, finger: [1] },
        { note: [baseNote, baseNote + 7], duration: 2, finger: [1, 5] }
    ];

    return { rightHandPattern, leftHandPattern };
}

// Fonction pour générer tous les steps de 2 à 8 et les ajouter aux patterns existants
function generateAllSteps(exercise: Exercise) {
    for (let step = 1; step <= 7; step++) {
        const { rightHandPattern, leftHandPattern } = generateStepPattern(step);
        exercise.patternRightHand.push(...rightHandPattern);
        exercise.patternLeftHand.push(...leftHandPattern);
    }
    return exercise;
}

// Appliquer la génération des étapes 2 à 8 pour exercice3
generateAllSteps(exercice3);


export const exercises = [exercice3, exercice1, exercice2,];
