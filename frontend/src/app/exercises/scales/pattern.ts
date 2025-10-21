import { reducedFraction } from "../../desktop/model/reduced-fraction";
import type { Exercise } from "../model";


const exercice4: Exercise = {
    title: "TestCode",
    deckName: "Awesome Hamilton",
    type: "scale",
    advice: "LH: 4th finger on 2nd degree of scale, RH; 4th finger on 7th degree of scale.",
    measure: 6,
    beat: reducedFraction(4, 4),
    tempo: 60,
    octaveShift: 0,
    repeat: 1,
    patternRightHand: [
        // ================= 1
        { note: [1], duration: 2, finger: [1] },
        { note: [2], duration: 2, finger: [1] },
        { note: [1], duration: 2, finger: [1] },
        { note: [2], duration: 2, finger: [1] },
    ],
    patternLeftHand: [
        { note: [1], duration: 2 },
        { note: [2], duration: 2 },
        { note: [1], duration: 2, finger: [1] },
        { note: [2], duration: 2, finger: [1] },
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
    patternLeftHand:[]
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


const exercice2: Exercise = {
    title: "Parallel motion in octaves",
    deckName: "Awesome Hamilton",
    type: "scale",
    advice: "LH: 4th finger on 2nd degree of scale, RH; 4th finger on 7th degree of scale.",
    measure: 4,
    beat: reducedFraction(4, 4),
    tempo: 60,
    octaveShift: 0,
    repeat: 3,
    patternRightHand: [
        // ================= 1
        { note: [1], duration: 4, finger: [1] },
        { note: [2], duration: 4, finger: [2] },
        { note: [3], duration: 4, finger: [3] },
        { note: [4], duration: 4, finger: [1] },
        { note: [5], duration: 4, finger: [2] },
        { note: [6], duration: 4, finger: [3] },
        { note: [7], duration: 4, finger: [4] },
        { note: [8], duration: 4, finger: [1] },
        // ================= 2
        { note: [9], duration: 4, finger: [2] },
        { note: [10], duration: 4, finger: [3] },
        { note: [11], duration: 4, finger: [1] },
        { note: [12], duration: 4, finger: [2] },
        { note: [13], duration: 4, finger: [3] },
        { note: [14], duration: 4, finger: [4] },
        { note: [15], duration: 4, finger: [5] },
        { note: [14], duration: 4, finger: [4] },
        // ================= 2
        { note: [13], duration: 4, finger: [3] },
        { note: [12], duration: 4, finger: [2] },
        { note: [11], duration: 4, finger: [1] },
        { note: [10], duration: 4, finger: [3] },
        { note: [9], duration: 4, finger: [3] },
        { note: [8], duration: 4, finger: [1] },
        { note: [7], duration: 4, finger: [4] },
        { note: [6], duration: 4, finger: [3] },
        // ================= 2
        { note: [5], duration: 4, finger: [1] },
        { note: [4], duration: 4, finger: [1] },
        { note: [3], duration: 4, finger: [3] },
        { note: [2], duration: 4, finger: [2] },
        { note: [1], duration: 1, finger: [1] },
    ],
    patternLeftHand: [
        // ================= 1
        { note: [1], duration: 4, finger: [5] },
        { note: [2], duration: 4, finger: [4] },
        { note: [3], duration: 4, finger: [3] },
        { note: [4], duration: 4, finger: [2] },
        { note: [5], duration: 4, finger: [1] },
        { note: [6], duration: 4, finger: [3] },
        { note: [7], duration: 4, finger: [2] },
        { note: [8], duration: 4, finger: [1] },
        // ================= 2
        { note: [9], duration: 4, finger: [4] },
        { note: [10], duration: 4, finger: [3] },
        { note: [11], duration: 4, finger: [2] },
        { note: [12], duration: 4, finger: [1] },
        { note: [13], duration: 4, finger: [3] },
        { note: [14], duration: 4, finger: [2] },
        { note: [15], duration: 4, finger: [1] },
        { note: [14], duration: 4, finger: [2] },
        // ================= 2
        { note: [13], duration: 4, finger: [3] },
        { note: [12], duration: 4, finger: [1] },
        { note: [11], duration: 4, finger: [2] },
        { note: [10], duration: 4, finger: [3] },
        { note: [9], duration: 4, finger: [4] },
        { note: [8], duration: 4, finger: [1] },
        { note: [7], duration: 4, finger: [2] },
        { note: [6], duration: 4, finger: [3] },
        // ================= 2
        { note: [5], duration: 4, finger: [1] },
        { note: [4], duration: 4, finger: [2] },
        { note: [3], duration: 4, finger: [3] },
        { note: [2], duration: 4, finger: [4] },
        { note: [1], duration: 1, finger: [5] },
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
    repeat: 3,
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


export const exercises = [  exercice3, exercice1, exercice2, ];