import type { PlayConfiguration } from './model';

/**
 * What happens with the notes of one hand while the score plays:
 * - `wait`: playback waits until the student plays each note (wait mode); the app does not play them;
 * - `along`: playback keeps the tempo and the student plays along with the app, which plays them too; each key
 *   press is assessed by its time;
 * - `app`: the app plays them (listening, or the other hand of the student).
 *
 * The notes of a `wait` or `along` hand are the ones the student plays: they go to the play guide (keyboard
 * lights, a MIDI output for lights). The sound (the mixer's `score` bus) gets the `app` and `along` ones. Wait
 * and along do not mix: waiting pauses the playback that play-along assesses against.
 */
export type HandMode = 'wait' | 'along' | 'app';

export type HandSide = 'left' | 'right';

type HandFlags = Pick<PlayConfiguration, 'waitForLeftHand' | 'waitForRightHand' | 'alongLeftHand' | 'alongRightHand'>;

export function handModeOf(config: HandFlags, side: HandSide): HandMode {
  const wait = side === 'left' ? config.waitForLeftHand : config.waitForRightHand;
  const along = side === 'left' ? config.alongLeftHand : config.alongRightHand;
  return wait ? 'wait' : along ? 'along' : 'app';
}

/** The mode of the hand of a score note ('lh' or 'rh', as the player names them). */
export function handModeOfNote(config: HandFlags, hand: string): HandMode {
  return handModeOf(config, hand === 'lh' ? 'left' : 'right');
}

/**
 * Sets the mode of one hand, keeping wait and along apart: choosing one of them sends the other hand back to
 * `app` if it was on the other one.
 */
export function withHandMode(config: HandFlags, side: HandSide, mode: HandMode): Required<HandFlags> {
  const next: Required<HandFlags> = {
    waitForLeftHand: config.waitForLeftHand,
    waitForRightHand: config.waitForRightHand,
    alongLeftHand: !!config.alongLeftHand,
    alongRightHand: !!config.alongRightHand,
  };
  if (side === 'left') {
    next.waitForLeftHand = mode === 'wait';
    next.alongLeftHand = mode === 'along';
  } else {
    next.waitForRightHand = mode === 'wait';
    next.alongRightHand = mode === 'along';
  }
  const other: HandSide = side === 'left' ? 'right' : 'left';
  const otherMode = handModeOf(next, other);
  if ((mode === 'wait' && otherMode === 'along') || (mode === 'along' && otherMode === 'wait')) {
    if (other === 'left') {
      next.waitForLeftHand = false;
      next.alongLeftHand = false;
    } else {
      next.waitForRightHand = false;
      next.alongRightHand = false;
    }
  }
  return next;
}

/**
 * The toolbar's hand toggles: a pressed hand waits for the student; released, it is played along. When a hand
 * waits, the released one is played by the app (waiting pauses the tempo play-along needs); when none waits, both
 * are played along.
 */
export function withWait(config: HandFlags, side: HandSide, wait: boolean): Required<HandFlags> {
  const left = side === 'left' ? wait : config.waitForLeftHand;
  const right = side === 'right' ? wait : config.waitForRightHand;
  const along = !left && !right;
  return { waitForLeftHand: left, waitForRightHand: right, alongLeftHand: along, alongRightHand: along };
}

/** Whether the student plays the hand (wait or along): what a practice take records. */
export function studentPlays(config: HandFlags, side: HandSide): boolean {
  return handModeOf(config, side) !== 'app';
}

/** The hands the student plays (waited for or played along), as practice takes and the coach name them. */
export function studentHands(config: HandFlags): 'both' | 'left' | 'right' | 'listen' {
  const left = studentPlays(config, 'left');
  const right = studentPlays(config, 'right');
  return left && right ? 'both' : left ? 'left' : right ? 'right' : 'listen';
}

/** How the student plays their hands: 'wait' or 'along' (they never mix); null when the app plays both (listening). */
export function handsModeOf(config: HandFlags): 'wait' | 'along' | null {
  if (config.waitForLeftHand || config.waitForRightHand) return 'wait';
  if (config.alongLeftHand || config.alongRightHand) return 'along';
  return null;
}

/** True when no hand waits: playback keeps the tempo, and key presses are assessed by their time. */
export function isTimed(config: HandFlags): boolean {
  return !config.waitForLeftHand && !config.waitForRightHand;
}

/** True when the app plays both hands: nothing is asked of the student (listening). */
export function isListening(config: HandFlags): boolean {
  return handModeOf(config, 'left') === 'app' && handModeOf(config, 'right') === 'app';
}
