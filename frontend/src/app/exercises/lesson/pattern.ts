import { reducedFraction } from "../../desktop/model/reduced-fraction";
import type { Exercise } from "../model";



const exercice1: Exercise = {
    title: "Merrily We Roll Along (C-D-E)",
    deckName: "Awesome Hamilton",
    type: "melody",
    advice: "Tap (or clap) the rhythm, counting aloud.",
    measure: 4,
    beat: reducedFraction(4, 4),
    tempo: 100,
    octaveShift: 0,
    patternRightHand: [
        // ================= 1
        { note: [5], duration: 4, finger: [3] },
        { note: [3], duration: 4, finger: [2] },
        { note: [1], duration: 4, finger: [1] },
        { note: [3], duration: 4, finger: [2] },
        // ================= 2
        { note: [5], duration: 4, finger: [3] },
        { note: [1,5], duration: 4, finger: [1,3] },
        { note: [1,5], duration: 2, finger: [1,3] },        
        // ================= 3
        { note: [3], duration: 4, finger: [2] },
        { note: [3], duration: 4, finger: [2] },
        { note: [3], duration: 2, finger: [2] },
        // ================= 4
        { note: [5], duration: 4, finger: [3] },
        { note: [1,5], duration: 4, finger: [1,3] },
        { note: [1,5], duration: 2, finger: [1,3] },
    ],
    patternLeftHand: [
        { note: [5-12], duration: 4, finger: [1] },
        { note: [3-12], duration: 4, finger: [2] },
        { note: [1-12], duration: 4, finger: [3] },
        { note: [3-12], duration: 4, finger: [2] },
        // ================= 2
        { note: [5-12], duration: 4, finger: [1] },
        { note: [1-12,5-12], duration: 4, finger: [1,3] },
        { note: [1-12,5-12], duration: 2, finger: [1,3] },        
        // ================= 3
        { note: [3-12], duration: 4, finger: [2] },
        { note: [3-12], duration: 4, finger: [2] },
        { note: [5-12], duration: 4, finger: [1] },
        { note: [3-12], duration: 4, finger: [2] },
        // ================= 4
        { note: [1-12], duration: 1, finger: [3] },
    ]

}

const exercice2: Exercise = {
    title: "Merrily We Roll Along (F-G-A)",
    deckName: "Awesome Hamilton",
    type: "melody",
    advice: "Tap (or clap) the rhythm, counting aloud.",
    measure: 4,
    beat: reducedFraction(4, 4),
    tempo: 100,
    octaveShift: 0,
    patternRightHand: [
        // ================= 1
        { note: [6 + 5], duration: 4, finger: [3] },
        { note: [6 + 3], duration: 4, finger: [2] },
        { note: [6 + 1], duration: 4, finger: [1] },
        { note: [6 + 3], duration: 4, finger: [2] },
        // ================= 2
        { note: [6 + 5], duration: 4, finger: [3] },
        { note: [6 + 1,6 + 5], duration: 4, finger: [1,3] },
        { note: [6 + 1,6 + 5], duration: 2, finger: [1,3] },        
        // ================= 3
        { note: [6 + 3], duration: 4, finger: [2] },
        { note: [6 + 3], duration: 4, finger: [2] },
        { note: [6 + 3], duration: 2, finger: [2] },
        // ================= 4
        { note: [6 + 5], duration: 4, finger: [3] },
        { note: [6 + 1,6 + 5], duration: 4, finger: [1,3] },
        { note: [6 + 1,6 + 5], duration: 2, finger: [1,3] },
    ],
    patternLeftHand: [
        { note: [6 + 5-12], duration: 4, finger: [1] },
        { note: [6 + 3-12], duration: 4, finger: [2] },
        { note: [6 + 1-12], duration: 4, finger: [3] },
        { note: [6 + 3-12], duration: 4, finger: [2] },
        // ================= 2
        { note: [6 + 5-12], duration: 4, finger: [1] },
        { note: [6 + 1-12,6 + 5-12], duration: 4, finger: [1,3] },
        { note: [6 + 1-12,6 + 5-12], duration: 2, finger: [1,3] },        
        // ================= 3
        { note: [6 + 3-12], duration: 4, finger: [2] },
        { note: [6 + 3-12], duration: 4, finger: [2] },
        { note: [6 + 5-12], duration: 4, finger: [1] },
        { note: [6 + 3-12], duration: 4, finger: [2] },
        // ================= 4
        { note: [6 + 1-12], duration: 1, finger: [3] },
    ]

}

export const exercises = [exercice1, exercice2];