import { reducedFraction } from "../../desktop/model/reduced-fraction";
import type { Exercise } from "../model";

const exercice1 = {
    title: "Two-octave Arpeggios, root, 1st and 2nd inversions",
    measure: 4,
    type: "chord",
    patternSize: 3,
    advice: "Pratice slowly, and increase the speed gradually. Always use a metronome when practicing exercises. Use the correct fingering. Repeat each inversion multiple time.", 
    beat: reducedFraction(7, 4),
    tempo: 60,
    patternLeftHand: [
        // root position
        { note: [1], duration: 8, finger: [5] },
        { note: [2], duration: 8, finger: [4] },
        { note: [3], duration: 8, finger: [2] },

        { note: [4], duration: 8, finger: [1] },
        { note: [5], duration: 8, finger: [4] },
        { note: [6], duration: 8, finger: [2] },
        
        { note: [7], duration: 8, finger: [1] },
        { note: [6], duration: 8, finger: [2] },
        { note: [5], duration: 8, finger: [4] },
    
        { note: [4], duration: 8, finger: [1] },
        { note: [3], duration: 8, finger: [2] },
        { note: [2], duration: 8, finger: [4] },
    
        { note: [1], duration: 4, finger: [5] },
        // 1st inversion
        { note: [1], duration: 8, finger: [5] },
        { note: [2], duration: 8, finger: [4] },
        { note: [3], duration: 8, finger: [2] },

        { note: [4], duration: 8, finger: [1] },
        { note: [5], duration: 8, finger: [4] },
        { note: [6], duration: 8, finger: [2] },
        
        { note: [7], duration: 8, finger: [1] },
        { note: [6], duration: 8, finger: [2] },
        { note: [5], duration: 8, finger: [4] },
    
        { note: [4], duration: 8, finger: [1] },
        { note: [3], duration: 8, finger: [2] },
        { note: [2], duration: 8, finger: [4] },
    
        { note: [1], duration: 4, finger: [5] },


        // 2nd inversion
        { note: [1], duration: 8, finger: [5] },
        { note: [2], duration: 8, finger: [3] },
        { note: [3], duration: 8, finger: [2] },

        { note: [4], duration: 8, finger: [1] },
        { note: [5], duration: 8, finger: [3] },
        { note: [6], duration: 8, finger: [2] },
        
        { note: [7], duration: 8, finger: [1] },
        { note: [6], duration: 8, finger: [2] },
        { note: [5], duration: 8, finger: [3] },
    
        { note: [4], duration: 8, finger: [1] },
        { note: [3], duration: 8, finger: [2] },
        { note: [2], duration: 8, finger: [3] },
    
        { note: [1], duration: 4, finger: [5] },

    ],
    patternRightHand: [
        // root position
        { note: [1], duration: 8, finger: [1] },
        { note: [2], duration: 8, finger: [2] },
        { note: [3], duration: 8, finger: [3] },

        { note: [4], duration: 8, finger: [1] },
        { note: [5], duration: 8, finger: [2] },
        { note: [6], duration: 8, finger: [3] },
        
        { note: [7], duration: 8, finger: [5] },
        { note: [6], duration: 8, finger: [3] },
        { note: [5], duration: 8, finger: [2] },
    
        { note: [4], duration: 8, finger: [1] },
        { note: [3], duration: 8, finger: [3] },
        { note: [2], duration: 8, finger: [2] },
    
        { note: [1], duration: 4, finger: [1] },
        // 1st inversion
        { note: [1], duration: 8, finger: [1] },
        { note: [2], duration: 8, finger: [2] },
        { note: [3], duration: 8, finger: [4] },

        { note: [4], duration: 8, finger: [1] },
        { note: [5], duration: 8, finger: [2] },
        { note: [6], duration: 8, finger: [4] },
        
        { note: [7], duration: 8, finger: [5] },
        { note: [6], duration: 8, finger: [4] },
        { note: [5], duration: 8, finger: [2] },
    
        { note: [4], duration: 8, finger: [1] },
        { note: [3], duration: 8, finger: [4] },
        { note: [2], duration: 8, finger: [2] },
    
        { note: [1], duration: 4, finger: [1] },


        // 2nd inversion
        { note: [1], duration: 8, finger: [1] },
        { note: [2], duration: 8, finger: [2] },
        { note: [3], duration: 8, finger: [4] },

        { note: [4], duration: 8, finger: [1] },
        { note: [5], duration: 8, finger: [2] },
        { note: [6], duration: 8, finger: [4] },
        
        { note: [7], duration: 8, finger: [5] },
        { note: [6], duration: 8, finger: [4] },
        { note: [5], duration: 8, finger: [2] },
    
        { note: [4], duration: 8, finger: [1] },
        { note: [3], duration: 8, finger: [4] },
        { note: [2], duration: 8, finger: [2] },
    
        { note: [1], duration: 4, finger: [1] },

    ]

} as Exercise

const exercice2 = {
    title: "Dominant Seventh Arpeggios (root position)",
    measure: 4,
    type: "chord",
    patternSize: 4,
    advice: "Always use a metronome when practicing exercises",
    beat: reducedFraction(3, 4),
    tempo: 60,
    patternLeftHand: [
        // root position
        { note: [1], duration: 8, finger: [5] },
        { note: [2], duration: 8, finger: [4] },
        { note: [3], duration: 8, finger: [3] },
        { note: [4], duration: 8, finger: [2] },
        { note: [5], duration: 8, finger: [1] },
        { note: [6], duration: 8, finger: [4] },
        { note: [7], duration: 8, finger: [3] },
        { note: [8], duration: 8, finger: [2] },
        { note: [9], duration: 8, finger: [1] },
        { note: [8], duration: 8, finger: [2] },
        { note: [7], duration: 8, finger: [3] },
        { note: [6], duration: 8, finger: [4] },
        { note: [5], duration: 8, finger: [1] },
        { note: [4], duration: 8, finger: [2] },
        { note: [3], duration: 8, finger: [3] },
        { note: [2], duration: 8, finger: [4] },
        { note: [1], duration: 4, finger: [5] },
        
        { note: [1], duration: 8, finger: [5] },
        { note: [2], duration: 8, finger: [4] },
        { note: [3], duration: 8, finger: [3] },
        { note: [4], duration: 8, finger: [2] },
        { note: [5], duration: 8, finger: [1] },
        { note: [6], duration: 8, finger: [4] },
        { note: [7], duration: 8, finger: [3] },
        { note: [8], duration: 8, finger: [2] },
        { note: [9], duration: 8, finger: [1] },
        { note: [8], duration: 8, finger: [2] },
        { note: [7], duration: 8, finger: [3] },
        { note: [6], duration: 8, finger: [4] },
        { note: [5], duration: 8, finger: [1] },
        { note: [4], duration: 8, finger: [2] },
        { note: [3], duration: 8, finger: [3] },
        { note: [2], duration: 8, finger: [4] },
        { note: [1], duration: 4, finger: [5] },
    ],
    patternRightHand: [
        // root position
        { note: [1], duration: 8, finger: [1] },
        { note: [2], duration: 8, finger: [2] },
        { note: [3], duration: 8, finger: [3] },
        { note: [4], duration: 8, finger: [4] },
        { note: [5], duration: 8, finger: [1] },
        { note: [6], duration: 8, finger: [2] },
        { note: [7], duration: 8, finger: [3] },
        { note: [8], duration: 8, finger: [4] },
        { note: [9], duration: 8, finger: [5] },
        { note: [8], duration: 8, finger: [4] },
        { note: [7], duration: 8, finger: [3] },
        { note: [6], duration: 8, finger: [2] },
        { note: [5], duration: 8, finger: [1] },

        { note: [4], duration: 8, finger: [4] },
        { note: [3], duration: 8, finger: [3] },
        { note: [2], duration: 8, finger: [2] },
        { note: [1], duration: 4, finger: [1] },
        { note: [1], duration: 8, finger: [1] },
        { note: [2], duration: 8, finger: [2] },
        { note: [3], duration: 8, finger: [3] },
        { note: [4], duration: 8, finger: [4] },
        { note: [5], duration: 8, finger: [1] },
        { note: [6], duration: 8, finger: [2] },
        { note: [7], duration: 8, finger: [3] },
        { note: [8], duration: 8, finger: [4] },
        { note: [9], duration: 8, finger: [5] },
        { note: [8], duration: 8, finger: [4] },
        { note: [7], duration: 8, finger: [3] },
        { note: [6], duration: 8, finger: [2] },
        { note: [5], duration: 8, finger: [1] },
        { note: [4], duration: 8, finger: [4] },
        { note: [3], duration: 8, finger: [3] },
        { note: [2], duration: 8, finger: [2] },
        { note: [1], duration: 4, finger: [1] },
    ]

} as Exercise



export const exercises = [exercice1, exercice2];