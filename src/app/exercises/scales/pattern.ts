import { reducedFraction } from "../../desktop/model/reduced-fraction";
import type { Exercise } from "../model";



const exercice2: Exercise = {
    title: "Parallel motion in octaves",
    deckName: "Awesome Hamilton",
    type: "scale",
    advice: "LH: 4th finger on 2nd degree of scale, RH; 4th finger on 7th degree of scale.",
    measure: 4,
    beat: reducedFraction(2, 2),
    tempo: 60,
    octaveShift: -1,
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
        { note: [6], duration: 8, finger: [] },
        // ================= 2
        { note: [5], duration: 8, finger: [] },
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
    patternRightHand: [
        // ================= 1
        { note: [0], duration: 8,  },
        { note: [0], duration: 8  },
        { note: [0], duration: 8 },
        { note: [0], duration: 8 },
        { note: [0], duration: 8 },
        { note: [0], duration: 8 },
        { note: [0], duration: 8 },
        { note: [0], duration: 8 },  
                // ================= 1      
        { note: [1], duration: 8, finger: [1] },
        { note: [2], duration: 8, finger: [2] },
        { note: [3], duration: 8, finger: [3] },
        { note: [4], duration: 8, finger: [1] },
        { note: [5], duration: 8, finger: [2] },
        { note: [6], duration: 8, finger: [3] },
        { note: [7], duration: 8, finger: [4] },
        { note: [8], duration: 8, finger: [5] },
        // ================= 2
        { note: [8], duration: 8, finger: [5] },
        { note: [7], duration: 8, finger: [4] },        
        { note: [6], duration: 8, finger: [3] }, 
        { note: [5], duration: 8, finger: [2] },
        { note: [4], duration: 8, finger: [1] },
        { note: [3], duration: 8, finger: [3] },
        { note: [2], duration: 8, finger: [2] },
        { note: [1], duration: 8, finger: [1] },
        // { note: [0], duration: 8, finger: [] },
        // // ================= 2
        { note: [0], duration: 8, },
        { note: [0], duration: 8, },
        { note: [0], duration: 8, },
        { note: [0], duration: 8, },
        { note: [0], duration: 2, },
        { note: [0], duration: 8, },
        { note: [0], duration: 2, },   
    ],
    patternLeftHand: [
        // // ================= 1
        { note: [1], duration: 8, finger: [5] },
        { note: [2], duration: 8, finger: [4] },
        { note: [3], duration: 8, finger: [3] },
        { note: [4], duration: 8, finger: [2] },
        { note: [5], duration: 8, finger: [1] },
        { note: [6], duration: 8, finger: [3] },
        { note: [7], duration: 8, finger: [2] },
        { note: [8], duration: 8, finger: [1] },
        // ================= 2
        { note: [0], duration: 8, },
        { note: [0], duration: 8, },
        { note: [0], duration: 8, },
        { note: [0], duration: 8, },
        { note: [0], duration: 8, },
        { note: [0], duration: 8, },
        { note: [0], duration: 8, },
        { note: [0], duration: 8, },
        // ================= 2
        { note: [0], duration: 8, },
        { note: [0], duration: 8, },
        { note: [0], duration: 8, },
        { note: [0], duration: 8, },
        { note: [0], duration: 8, },
        { note: [0], duration: 8, },
        { note: [0], duration: 8, },
        { note: [0], duration: 8, },
        // // ================= 2
        { note: [8], duration: 8, finger: [1] },
        { note: [7], duration: 8, finger: [2] },
        { note: [6], duration: 8, finger: [3] },
        { note: [5], duration: 8, finger: [4] },
        { note: [4], duration: 8, finger: [5] },
        { note: [3], duration: 8, finger: [1] },
        { note: [2], duration: 8, finger: [2] },
        { note: [1], duration: 8, finger: [3] },
    ]

}




export const exercises = [exercice1, exercice2,];