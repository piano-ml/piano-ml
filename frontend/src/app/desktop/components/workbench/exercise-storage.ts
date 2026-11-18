/**
 * How the workbench hands an exercise over through localStorage (issue #413).
 *
 * The exercises page (and anything else that opens an exercise) writes the exercise to localStorage, then navigates
 * to /workbench/scale/... or /workbench/agility/.... When a workbench is already on screen under another route, the
 * router destroys it before creating the next one: the leaving workbench must not delete the exercise written for
 * the next one. It clears the storage only when the storage still holds the exercise it loaded itself.
 */

/** Whether a leaving workbench clears the stored exercise: only the one it loaded, never one written after it. */
export function shouldClearStoredExercise(loadedInfo: string | null, storedInfo: string | null): boolean {
  return loadedInfo !== null && storedInfo === loadedInfo;
}

/**
 * The exercises page of a workbench exercise URL, for when its data is gone (Back to the URL after leaving it, a
 * shared link): the two routes order their parameters differently.
 *   /workbench/scale/:scaleKey/:selectedKey/:exerciseKey    -> /exercises/scale/:selectedKey/:scaleKey/:exerciseKey
 *   /workbench/agility/:chordKey/:selectedKey/:exerciseKey  -> /exercises/agility/:selectedKey/:chordKey/:exerciseKey
 * Anything else gives the exercises home.
 */
export function exercisesPageFor(workbenchUrl: string): string[] {
  const path = workbenchUrl.split(/[?#]/)[0];
  const [, root, kind, pattern, key, exercise] = path.split('/');
  if (root === 'workbench' && (kind === 'scale' || kind === 'agility') && pattern && key && exercise) {
    return ['/', 'exercises', kind, key, pattern, exercise];
  }
  return ['/', 'exercises'];
}
