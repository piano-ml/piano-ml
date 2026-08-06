import { reducedFraction } from "../../desktop/model/reduced-fraction";
import type { Exercise, NoteInPattern } from "../model";




interface FingeringPatterns {
    patternRH: number[];
    patternLH: number[];
}

/**
 * Standard fingering for a two octaves scale played up then down (29 notes),
 * both hands starting on the tonic.
 */
function getScaleFingeringPatterns(key: string): FingeringPatterns | null {
    const whiteKeys = ['C', 'D', 'E', 'F', 'G', 'A', 'B', 'a', 'e', 'b', 'f', 'c', 'g', 'd'];
    const blackKeys = ['C#', 'Db', 'D#', 'Eb', 'F#', 'Gb', 'G#', 'Ab', 'A#', 'Bb', "f#", "c#", "g#", "d#", "bb"];

    // Normalize the root note (remove octave numbers)
    const rootNote = key.replace(/[0-9]/g, '');

    const isWhiteKey = whiteKeys.includes(rootNote);
    const isBlackKey = blackKeys.includes(rootNote);

    if (!isWhiteKey && !isBlackKey) return null;

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
                patternLH = [3, 2, 1, 4, 3, 2, 1, 3, 2, 1, 4, 3, 2, 1, 2, 1, 2, 3, 4, 1, 2, 3, 1, 2, 3, 4, 1, 2, 3];
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

    return { patternRH, patternLH };
}

function scaleFingering(key: string, exercise: Exercise): void {
    const patterns = getScaleFingeringPatterns(key);
    if (!patterns) return;

    // patch exercice with patterns
    // RH
    exercise.patternRightHand.forEach((note, i) => {
        if (note.note[0] !== 0) { // Skip rests
            note.finger = [patterns.patternRH[i % patterns.patternRH.length]];
        }
    });
    // LH
    exercise.patternLeftHand.forEach((note, i) => {
        if (note.note[0] !== 0) { // Skip rests
            note.finger = [patterns.patternLH[i % patterns.patternLH.length]];
        }
    });
}

/**
 * Fingering for a hand of the parallel interval exercises (thirds, sixths,
 * tenths). A hand starting on the tonic follows the usual scale shape, so its
 * pattern applies by position and keeps the 5th finger at both ends of the run.
 *
 * A hand starting anywhere else takes its finger from the degree it plays: thumb
 * positions repeat every 7 degrees, and the descending half of a scale pattern
 * mirrors the ascending one. The repeating octave is read from the second one
 * (degrees 8 to 14) because the first note of a scale often takes a finger of
 * its own.
 */
function applyIntervalFingering(notes: NoteInPattern[], pattern: number[]): void {
    const startsOnTonic = notes.length > 0 && (notes[0].note[0] - 1) % 7 === 0;
    const oneOctave = pattern.slice(7, 14);

    notes.forEach((note, i) => {
        const degree = note.note[0];
        if (degree === 0) return; // Skip rests
        note.finger = startsOnTonic
            ? [pattern[i % pattern.length]]
            : [oneOctave[(degree - 1) % 7]];
    });
}

function parallelIntervalFingering(key: string, exercise: Exercise): void {
    const patterns = getScaleFingeringPatterns(key);
    if (!patterns) return;

    applyIntervalFingering(exercise.patternRightHand, patterns.patternRH);
    applyIntervalFingering(exercise.patternLeftHand, patterns.patternLH);
}

/**
 * Two octaves up then down, both hands moving in the same direction.
 * `startDegree` is the scale degree the hand starts on, `noteDuration` the value
 * of the running notes (4 = quarters, 8 = eighths). The closing note is held four
 * times longer, so quarters end on a whole note and eighths on a half note.
 */
function parallelMotionPattern(startDegree: number, noteDuration: number) {
    const degrees: number[] = [];
    for (let i = 0; i <= 14; i++) {
        degrees.push(startDegree + i);
    }
    for (let i = 13; i >= 0; i--) {
        degrees.push(startDegree + i);
    }
    return degrees.map((degree, i) => ({
        note: [degree],
        duration: i === degrees.length - 1 ? noteDuration / 4 : noteDuration,
    }));
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
    key: "contrary_motion",
    title: "Contrary motion starting on the same note.",
    deckName: "Furious Shirley",
    type: "scale",
    advice: "Both thumbs play the same note. Up then down.",
    measure: 4,
    beat: reducedFraction(4, 4),
    tempo: 60,
    octaveShift: -1,
    repeat: 1,
    fingeringFn: scaleFingering,    
        patternRightHand: [
        // ================= 1
        { note: [1+7], duration: 4, finger: [1] },
        { note: [2+7], duration: 4, finger: [2] },
        { note: [3+7], duration: 4, finger: [3] },
        { note: [4+7], duration: 4, finger: [1] },
        { note: [5+7], duration: 4, finger: [2] },
        { note: [6+7], duration: 4, finger: [3] },
        { note: [7+7], duration: 4, finger: [4] },
        { note: [8+7], duration: 4, finger: [1] },
        // ================= 2
        { note: [9+7], duration: 4, finger: [2] },
        { note: [10+7], duration: 4, finger: [3] },
        { note: [11+7], duration: 4, finger: [1] },
        { note: [12+7], duration: 4, finger: [2] },
        { note: [13+7], duration: 4, finger: [3] },
        { note: [14+7], duration: 4, finger: [4] },
        { note: [15+7], duration: 4, finger: [5] },
        { note: [14+7], duration: 4, finger: [4] },
        // ================= 2
        { note: [13+7], duration: 4, finger: [3] },
        { note: [12+7], duration: 4, finger: [2] },
        { note: [11+7], duration: 4, finger: [1] },
        { note: [10+7], duration: 4, finger: [3] },
        { note: [9+7], duration: 4, finger: [3] },
        { note: [8+7], duration: 4, finger: [1] },
        { note: [7+7], duration: 4, finger: [4] },
        { note: [6+7], duration: 4, finger: [3] },
        // ================= 2
        { note: [5+7], duration: 4, finger: [1] },
        { note: [4+7], duration: 4, finger: [1] },
        { note: [3+7], duration: 4, finger: [3] },
        { note: [2+7], duration: 4, finger: [2] },
        { note: [1+7], duration: 1, finger: [1] },
    ],
    patternLeftHand: [
        // ================= 1
        { note: [15], duration: 4, finger: [5] },
        { note: [14], duration: 4, finger: [4] },
        { note: [13], duration: 4, finger: [3] },
        { note: [12], duration: 4, finger: [2] },
        { note: [11], duration: 4, finger: [1] },
        { note: [10], duration: 4, finger: [3] },
        { note: [9], duration: 4, finger: [2] },
        { note: [8], duration: 4, finger: [1] },
        // ================= 2
        { note: [7], duration: 4, finger: [4] },
        { note: [6], duration: 4, finger: [3] },
        { note: [5], duration: 4, finger: [2] },
        { note: [4], duration: 4, finger: [1] },
        { note: [3], duration: 4, finger: [3] },
        { note: [2], duration: 4, finger: [2] },
        { note: [1], duration: 4, finger: [1] },
        { note: [2], duration: 4, finger: [2] },
        // ================= 2
        { note: [3], duration: 4, finger: [3] },
        { note: [4], duration: 4, finger: [1] },
        { note: [5], duration: 4, finger: [2] },
        { note: [6], duration: 4, finger: [3] },
        { note: [7], duration: 4, finger: [4] },
        { note: [8], duration: 4, finger: [1] },
        { note: [9], duration: 4, finger: [2] },
        { note: [10], duration: 4, finger: [3] },
        // ================= 2
        { note: [11], duration: 4, finger: [1] },
        { note: [12], duration: 4, finger: [2] },
        { note: [13], duration: 4, finger: [3] },
        { note: [14], duration: 4, finger: [4] },
        { note: [15], duration: 1, finger: [5] },
    ]
}


const exercice4: Exercise = {
    key: "parallel_motion_in_octaves",
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
    // Both hands play the same degrees; the octave between them comes from the
    // register each hand is generated in.
    patternRightHand: parallelMotionPattern(1, 4),
    patternLeftHand: parallelMotionPattern(1, 4),
}

// Hands a third apart: LH on the tonic (degree 8 puts it one octave above its
// natural register), RH on the 3rd degree of the same octave.
const exercice5: Exercise = {
    key: "parallel_motion_in_thirds",
    title: "Parallel motion in thirds",
    deckName: "Awesome Hamilton",
    type: "scale",
    advice: "Hands a third apart: LH on the tonic, RH on the 3rd degree of the scale. Hands stay close, keep the thirds even. Two hands. Scales in parallel thirds are a common enough thing for intermediate to advanced technical exercise. Fingers crowding each other is what makes it challenging, but it is do-able. Each hand plays the scale as it ordinarily would, just separated by a third. The fingering is on the notation, just take it slowly until you’re able to do it, then gradually increase speed. There’s really no trick to it beyond that.",
    measure: 4,
    beat: reducedFraction(4, 4),
    tempo: 60,
    octaveShift: -1,
    repeat: 1,
    fingeringFn: parallelIntervalFingering,
    patternRightHand: parallelMotionPattern(3, 8),
    patternLeftHand: parallelMotionPattern(8, 8),
}

// Hands a sixth apart, the mirror of the thirds: the RH takes the tonic and the
// LH the 3rd degree of the octave below, which sits a sixth under it.
const exercice7: Exercise = {
    key: "parallel_motion_in_sixths",
    title: "Parallel motion in sixths",
    deckName: "Awesome Hamilton",
    type: "scale",
    advice: "Hands a sixth apart: RH on the tonic with the thumb, LH a sixth below on the 3rd degree of the scale (finger 3).",
    measure: 4,
    beat: reducedFraction(4, 4),
    tempo: 60,
    octaveShift: 0,
    repeat: 1,
    fingeringFn: parallelIntervalFingering,
    patternRightHand: parallelMotionPattern(1, 8),
    patternLeftHand: parallelMotionPattern(3, 8),
}

// Same relationship, but the hands are an octave farther apart: LH stays in its
// own register while the RH plays the 3rd degree an octave higher.
const exercice6: Exercise = {
    key: "parallel_motion_in_tenths",
    title: "Parallel motion in tenths",
    deckName: "Awesome Hamilton",
    type: "scale",
    advice: "Hands a tenth apart (octave + third): LH on the tonic, RH on the 3rd degree an octave higher. Open the arms and keep both hands together.",
    measure: 4,
    beat: reducedFraction(4, 4),
    tempo: 60,
    octaveShift: 0,
    repeat: 1,
    fingeringFn: parallelIntervalFingering,
    patternRightHand: parallelMotionPattern(3, 8),
    patternLeftHand: parallelMotionPattern(1, 8),
}

const exercice3: Exercise = {
    key: "left_than_right",
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

const exercice1: Exercise = {
    key: "intervals",
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
generateAllSteps(exercice1);


export const exercises = [exercice1, exercice2, exercice3, exercice4, exercice5, exercice7, exercice6,];
