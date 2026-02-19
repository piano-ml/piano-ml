type AlignableOsmdArrayElement = {
  isSkipable: boolean;
  osmdPitches: number[] | null;
  midiPitches: number[] | null;
  midiTicks: number | null;
  midiTicksDuration: number | null;
};

type MidiEvent = {
  midiPitches: number[];
  midiTicks: number;
  midiTicksDuration: number | null;
};

type SmithWatermanOptions = {
  exactMatchScore?: number;
  partialMatchScore?: number;
  mismatchScore?: number;
  gapScore?: number;
};

enum Direction {
  None = 0,
  Diag = 1,
  Up = 2,
  Left = 3,
}

/**
 * Variant 1 (comportement historique):
 * - Alignement local Smith-Waterman.
 * - Réaffecte les événements MIDI alignés.
 * - Ne modifie jamais isSkipable.
 */
export function smithWatermanAlign<T extends AlignableOsmdArrayElement>(
  osmdArray: T[],
  options: SmithWatermanOptions = {}
): T[] {
  const matched = computeMatchedPairs(osmdArray, options);
  if (!matched) {
    return osmdArray;
  }


  if (matched.midiEvents.length > matched.osmdPitchSeq.length) {
    console.warn("[smith-waterman][sw1] keep-original: cannot preserve all ticks (more midi events than alignable osmd slots)", {
      midiEvents: matched.midiEvents.length,
      osmdSlots: matched.osmdPitchSeq.length,
    });
    return osmdArray;
  }

  const completePairs = buildCompletePairsFromAnchors(
    matched.osmdPitchSeq.length,
    matched.midiEvents.length,
    matched.matchedPairs
  );

  return applyAlignment(
    osmdArray,
    matched.osmdIndices,
    matched.midiEvents,
    completePairs
  );
}

/**
 * Variant 2 (test):
 * - Même cœur SW local.
 * - Étend les matches de façon monotone quand les pitches se recouvrent.
 * - Ne force pas tous les OSMD non alignés à skipable.
 */
export function smithWatermanAlign2<T extends AlignableOsmdArrayElement>(
  osmdArray: T[],
  options: SmithWatermanOptions = {}
): T[] {
  const matched = computeMatchedPairs(osmdArray, options);
  if (!matched) {
    return osmdArray;
  }

  const midiPitchSeq = matched.midiEvents.map((event) => event.midiPitches);
  const extendedPairs = extendMatchesMonotonic(
    matched.osmdPitchSeq,
    midiPitchSeq,
    matched.matchedPairs
  );

  return applyAlignment(
    osmdArray,
    matched.osmdIndices,
    matched.midiEvents,
    extendedPairs
  );
}

function computeMatchedPairs<T extends AlignableOsmdArrayElement>(
  osmdArray: T[],
  options: SmithWatermanOptions
): {
  osmdIndices: number[];
  osmdPitchSeq: number[][];
  midiEvents: MidiEvent[];
  matchedPairs: Array<{ osmdSeqIndex: number; midiSeqIndex: number }>;
} | null {
  if (osmdArray.length === 0) {
    return null;
  }

  const exactMatchScore = options.exactMatchScore ?? 4;
  const partialMatchScore = options.partialMatchScore ?? 2;
  const mismatchScore = options.mismatchScore ?? -3;
  const gapScore = options.gapScore ?? -2;

  const { osmdIndices, osmdPitchSeq, midiEvents } = extractSequences(osmdArray);
  if (osmdPitchSeq.length === 0 || midiEvents.length === 0) {
    return null;
  }

  const midiPitchSeq = midiEvents.map((event) => event.midiPitches);
  const m = osmdPitchSeq.length;
  const n = midiPitchSeq.length;

  const score: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  const trace: Direction[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(Direction.None));

  let maxScore = 0;
  let maxI = 0;
  let maxJ = 0;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const similarity = pitchSimilarity(
        osmdPitchSeq[i - 1],
        midiPitchSeq[j - 1],
        exactMatchScore,
        partialMatchScore,
        mismatchScore
      );

      const diagScore = score[i - 1][j - 1] + similarity;
      const upScore = score[i - 1][j] + gapScore;
      const leftScore = score[i][j - 1] + gapScore;

      let best = 0;
      let dir = Direction.None;

      if (diagScore > best) {
        best = diagScore;
        dir = Direction.Diag;
      }
      if (upScore > best) {
        best = upScore;
        dir = Direction.Up;
      }
      if (leftScore > best) {
        best = leftScore;
        dir = Direction.Left;
      }

      score[i][j] = best;
      trace[i][j] = dir;

      if (best > maxScore) {
        maxScore = best;
        maxI = i;
        maxJ = j;
      }
    }
  }

  if (maxScore <= 0) {
    return null;
  }

  const matchedPairs = tracebackLocal(score, trace, maxI, maxJ);
  if (matchedPairs.length === 0) {
    return null;
  }

  return { osmdIndices, osmdPitchSeq, midiEvents, matchedPairs };
}

function extractSequences<T extends AlignableOsmdArrayElement>(osmdArray: T[]): {
  osmdIndices: number[];
  osmdPitchSeq: number[][];
  midiEvents: MidiEvent[];
} {
  const osmdIndices: number[] = [];
  const osmdPitchSeq: number[][] = [];

  for (let index = 0; index < osmdArray.length; index++) {
    const element = osmdArray[index];
    if (element.isSkipable) {
      continue;
    }
    osmdIndices.push(index);
    osmdPitchSeq.push(normalizePitchVector(element.osmdPitches));
  }

  const midiEvents: MidiEvent[] = osmdArray
    .filter((element): element is T & { midiTicks: number } => element.midiTicks != null)
    .map((element) => ({
      midiPitches: normalizePitchVector(element.midiPitches),
      midiTicks: element.midiTicks,
      midiTicksDuration: element.midiTicksDuration,
    }))
    .sort((left, right) => left.midiTicks - right.midiTicks);

  return { osmdIndices, osmdPitchSeq, midiEvents };
}

function tracebackLocal(
  score: number[][],
  trace: Direction[][],
  maxI: number,
  maxJ: number
): Array<{ osmdSeqIndex: number; midiSeqIndex: number }> {
  const matchedPairs: Array<{ osmdSeqIndex: number; midiSeqIndex: number }> = [];
  let i = maxI;
  let j = maxJ;

  while (i > 0 && j > 0 && score[i][j] > 0) {
    const dir = trace[i][j];
    if (dir === Direction.Diag) {
      matchedPairs.push({ osmdSeqIndex: i - 1, midiSeqIndex: j - 1 });
      i--;
      j--;
      continue;
    }
    if (dir === Direction.Up) {
      i--;
      continue;
    }
    if (dir === Direction.Left) {
      j--;
      continue;
    }
    break;
  }

  matchedPairs.reverse();
  return matchedPairs;
}

function applyAlignment<T extends AlignableOsmdArrayElement>(
  osmdArray: T[],
  osmdIndices: number[],
  midiEvents: MidiEvent[],
  matchedPairs: Array<{ osmdSeqIndex: number; midiSeqIndex: number }>
): T[] {
  const realigned: AlignableOsmdArrayElement[] = osmdArray.map((element) => ({
    ...element,
    midiPitches: null,
    midiTicks: null,
    midiTicksDuration: null,
    isSkipable: element.isSkipable,
  }));

  const usedOsmdSeqIndex = new Set<number>();

  for (const pair of [...matchedPairs].sort((left, right) => left.midiSeqIndex - right.midiSeqIndex)) {
    let chosenOsmdSeqIndex = Math.max(0, Math.min(osmdIndices.length - 1, pair.osmdSeqIndex));

    if (usedOsmdSeqIndex.has(chosenOsmdSeqIndex)) {
      let forward = chosenOsmdSeqIndex + 1;
      while (forward < osmdIndices.length && usedOsmdSeqIndex.has(forward)) {
        forward++;
      }

      if (forward < osmdIndices.length) {
        chosenOsmdSeqIndex = forward;
      } else {
        let backward = chosenOsmdSeqIndex - 1;
        while (backward >= 0 && usedOsmdSeqIndex.has(backward)) {
          backward--;
        }
        if (backward < 0) {
          continue;
        }
        chosenOsmdSeqIndex = backward;
      }
    }

    usedOsmdSeqIndex.add(chosenOsmdSeqIndex);

    const osmdIndex = osmdIndices[chosenOsmdSeqIndex];
    const midiEvent = midiEvents[pair.midiSeqIndex];
    realigned[osmdIndex].midiPitches = [...midiEvent.midiPitches];
    realigned[osmdIndex].midiTicks = midiEvent.midiTicks;
    realigned[osmdIndex].midiTicksDuration = midiEvent.midiTicksDuration;
  }

  return realigned as T[];
}

function buildCompletePairsFromAnchors(
  osmdCount: number,
  midiCount: number,
  anchors: Array<{ osmdSeqIndex: number; midiSeqIndex: number }>
): Array<{ osmdSeqIndex: number; midiSeqIndex: number }> {
  if (osmdCount <= 0 || midiCount <= 0) {
    return [];
  }

  const sortedAnchors = [...anchors]
    .sort((left, right) => left.midiSeqIndex - right.midiSeqIndex)
    .filter(
      (anchor) =>
        anchor.osmdSeqIndex >= 0 &&
        anchor.osmdSeqIndex < osmdCount &&
        anchor.midiSeqIndex >= 0 &&
        anchor.midiSeqIndex < midiCount
    );

  const monotonicAnchors: Array<{ osmdSeqIndex: number; midiSeqIndex: number }> = [];
  let previousMidi = -1;
  let previousOsmd = -1;
  for (const anchor of sortedAnchors) {
    if (anchor.midiSeqIndex > previousMidi && anchor.osmdSeqIndex > previousOsmd) {
      monotonicAnchors.push(anchor);
      previousMidi = anchor.midiSeqIndex;
      previousOsmd = anchor.osmdSeqIndex;
    }
  }

  const mapping = new Array<number>(midiCount).fill(-1);
  for (const anchor of monotonicAnchors) {
    mapping[anchor.midiSeqIndex] = anchor.osmdSeqIndex;
  }

  type Boundary = { midi: number; osmd: number };
  const boundaries: Boundary[] = [
    { midi: -1, osmd: -1 },
    ...monotonicAnchors.map((anchor) => ({ midi: anchor.midiSeqIndex, osmd: anchor.osmdSeqIndex })),
    { midi: midiCount, osmd: osmdCount },
  ];

  for (let boundaryIndex = 0; boundaryIndex < boundaries.length - 1; boundaryIndex++) {
    const left = boundaries[boundaryIndex];
    const right = boundaries[boundaryIndex + 1];

    const midiGapStart = left.midi + 1;
    const midiGapEnd = right.midi - 1;
    const midiGapSize = midiGapEnd - midiGapStart + 1;
    if (midiGapSize <= 0) {
      continue;
    }

    const osmdGapStart = left.osmd + 1;
    const osmdGapEnd = right.osmd - 1;
    const osmdGapSize = osmdGapEnd - osmdGapStart + 1;

    for (let offset = 0; offset < midiGapSize; offset++) {
      const midiIndex = midiGapStart + offset;
      let osmdIndex: number;

      if (osmdGapSize <= 0) {
        osmdIndex = Math.max(0, Math.min(osmdCount - 1, left.osmd + 1));
      } else if (midiGapSize <= osmdGapSize) {
        osmdIndex = osmdGapStart + offset;
      } else {
        const ratio = (offset * (osmdGapSize - 1)) / Math.max(1, midiGapSize - 1);
        osmdIndex = osmdGapStart + Math.round(ratio);
      }

      mapping[midiIndex] = Math.max(0, Math.min(osmdCount - 1, osmdIndex));
    }
  }

  for (let midiIndex = 0; midiIndex < mapping.length; midiIndex++) {
    if (mapping[midiIndex] !== -1) {
      continue;
    }

    const previous = midiIndex > 0 ? mapping[midiIndex - 1] : 0;
    mapping[midiIndex] = Math.max(0, Math.min(osmdCount - 1, previous));
  }

  const pairs: Array<{ osmdSeqIndex: number; midiSeqIndex: number }> = [];
  let previousAssignedOsmd = -1;
  for (let midiIndex = 0; midiIndex < mapping.length; midiIndex++) {
    let osmdIndex = mapping[midiIndex];
    if (osmdIndex < previousAssignedOsmd) {
      osmdIndex = previousAssignedOsmd;
    }
    osmdIndex = Math.max(0, Math.min(osmdCount - 1, osmdIndex));
    pairs.push({ osmdSeqIndex: osmdIndex, midiSeqIndex: midiIndex });
    previousAssignedOsmd = osmdIndex;
  }

  return pairs;
}

function extendMatchesMonotonic(
  osmdPitchSeq: number[][],
  midiPitchSeq: number[][],
  matchedPairs: Array<{ osmdSeqIndex: number; midiSeqIndex: number }>
): Array<{ osmdSeqIndex: number; midiSeqIndex: number }> {
  const result = [...matchedPairs];
  const usedOsmd = new Set(result.map((pair) => pair.osmdSeqIndex));
  const usedMidi = new Set(result.map((pair) => pair.midiSeqIndex));

  let prevOsmd = -1;
  let prevMidi = -1;

  for (const anchor of matchedPairs) {
    for (let o = prevOsmd + 1, m = prevMidi + 1; o < anchor.osmdSeqIndex && m < anchor.midiSeqIndex;) {
      if (usedOsmd.has(o)) {
        o++;
        continue;
      }
      if (usedMidi.has(m)) {
        m++;
        continue;
      }
      if (hasPitchOverlap(osmdPitchSeq[o], midiPitchSeq[m])) {
        result.push({ osmdSeqIndex: o, midiSeqIndex: m });
        usedOsmd.add(o);
        usedMidi.add(m);
      }
      o++;
      m++;
    }
    prevOsmd = anchor.osmdSeqIndex;
    prevMidi = anchor.midiSeqIndex;
  }

  for (let o = prevOsmd + 1, m = prevMidi + 1; o < osmdPitchSeq.length && m < midiPitchSeq.length;) {
    if (usedOsmd.has(o)) {
      o++;
      continue;
    }
    if (usedMidi.has(m)) {
      m++;
      continue;
    }
    if (hasPitchOverlap(osmdPitchSeq[o], midiPitchSeq[m])) {
      result.push({ osmdSeqIndex: o, midiSeqIndex: m });
      usedOsmd.add(o);
      usedMidi.add(m);
    }
    o++;
    m++;
  }

  result.sort((left, right) => left.osmdSeqIndex - right.osmdSeqIndex);
  return result;
}

function normalizePitchVector(pitches: number[] | null): number[] {
  if (!pitches || pitches.length === 0) {
    return [];
  }
  const normalized = pitches.map((value) => ((value % 12) + 12) % 12);
  return Array.from(new Set(normalized)).sort((left, right) => left - right);
}

function hasPitchOverlap(left: number[], right: number[]): boolean {
  if (left.length === 0 || right.length === 0) {
    return false;
  }
  const rightSet = new Set(right);
  return left.some((value) => rightSet.has(value));
}

function pitchSimilarity(
  osmd: number[],
  midi: number[],
  exactMatchScore: number,
  partialMatchScore: number,
  mismatchScore: number
): number {
  if (osmd.length === 0 || midi.length === 0) {
    return mismatchScore;
  }

  if (osmd.length === midi.length && osmd.every((value, index) => value === midi[index])) {
    return exactMatchScore;
  }

  const midiSet = new Set(midi);
  const hasOverlap = osmd.some((value) => midiSet.has(value));
  if (hasOverlap) {
    return partialMatchScore;
  }

  return mismatchScore;
}
