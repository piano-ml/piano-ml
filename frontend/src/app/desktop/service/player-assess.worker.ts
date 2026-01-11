// player-assess.worker.ts
// Version worker du service PlayerAssessService

export const GOOD_RANGE = 300 / 1000;
export const PERFECT_RANGE = 50 / 1000;
export const QUANT_RANGE = 40 / 1000;

export interface LiveStatus {
  shouldPause: boolean;
  expectations: Map<number, [string, number][]>;
  early: Map<number, [string, number][]>;
  bad: number | null;
  total: number;
  badCount: number;
  late: number;
}

let liveStatus: LiveStatus = {
  shouldPause: false,
  expectations: new Map<number, [string, number][]>(),
  early: new Map<number, [string, number][]>(),
  bad: null,
  total: 0,
  badCount: 0,
  late: 0,
};

function reset() {
  liveStatus = {
    shouldPause: false,
    expectations: new Map<number, [string, number][]>(),
    bad: null,
    early: new Map<number, [string, number][]>(),
    total: 0,
    badCount: 0,
    late: 0,
  };
}

function learnExpectation(noteTimeStart: number, noteTimeEnd: number, note: { midi: number }, hand: string): LiveStatus {
  if (!liveStatus.expectations.has(noteTimeStart)) {
    liveStatus.expectations.set(noteTimeStart, []);
  }
  liveStatus.expectations.get(noteTimeStart)!.push([hand, note.midi]);
  cleanEarly(noteTimeStart);
  checkExpectationsInEarly(noteTimeStart);
  checkShouldPause();
  return liveStatus;
}

function cleanEarly(noteTimeStart: number) {
  const earlyKeys = Array.from(liveStatus.early.keys()).filter(k => k < noteTimeStart - GOOD_RANGE);
  for (const key of earlyKeys) {
    liveStatus.early.delete(key);
  }
}

function getExpectation(): LiveStatus {
  checkShouldPause();
  return liveStatus;
}

function getNewActual(midiEvent: { note: number, time: number }): LiveStatus | null {
  liveStatus.bad = null;
  if (!maybeRemovePitchFromExpectations(midiEvent.note)) {
    liveStatus.bad = midiEvent.note;
    liveStatus.badCount += 1;
    if (!liveStatus.early.has(midiEvent.time)) {
      liveStatus.early.set(midiEvent.time, []);
    }
    liveStatus.early.get(midiEvent.time)!.push(['rh', midiEvent.note]);
  }
  checkShouldPause();
  return liveStatus;
}

function maybeRemovePitchFromExpectations(pitch: number): boolean {
  let gotIt = false;
  const keys = Array.from(liveStatus.expectations.keys());
  const oldestKey = Math.min(...keys);
  const oldestValue = liveStatus.expectations.get(oldestKey);
  if (oldestValue && oldestValue.map((v: [string, number]) => v[1]).includes(pitch)) {
    gotIt = true;
    oldestValue.splice(oldestValue.findIndex((v: [string, number]) => v[1] === pitch), 1);
    if (oldestValue.length === 0) {
      liveStatus.expectations.delete(oldestKey);
    } else {
      liveStatus.expectations.set(oldestKey, oldestValue);
    }
  }
  return gotIt;
}

function checkExpectationsInEarly(noteTimeStart: number) {
  for (const [earlyTime, earlyNotes] of liveStatus.early) {
    for (let i = 0; i < earlyNotes.length;) {
      const earlyNote = earlyNotes[i];
      const pitch = earlyNote[1];
      if (maybeRemovePitchFromExpectations(pitch)) {
        earlyNotes.splice(i, 1);
        if (earlyNotes.length === 0) {
          liveStatus.early.delete(earlyTime);
          break;
        }
      } else {
        i++;
      }
    }
  }
}

function checkShouldPause() {
  const previousShouldPause = liveStatus.shouldPause;
  liveStatus.shouldPause = liveStatus.expectations.size > 0;
  if (!previousShouldPause && liveStatus.shouldPause) {
    liveStatus.late += 1;
  }
}

// --- Communication avec le thread principal ---

self.onmessage = function (e) {
  const { action, payload } = e.data;
  let result: any = null;
  switch (action) {
    case 'reset':
      reset();
      result = liveStatus;
      break;
    case 'learnExpectation':
      result = learnExpectation(payload.noteTimeStart, payload.noteTimeEnd, payload.note, payload.hand);
      break;
    case 'getExpectation':
      result = getExpectation();
      break;
    case 'getNewActual':
      result = getNewActual(payload.midiEvent);
      break;
    default:
      result = { error: 'Unknown action' };
  }
  // Les Maps ne sont pas sérialisables, conversion en objets simples
  self.postMessage(serializeLiveStatus(result));
};

function serializeLiveStatus(status: LiveStatus) {
  return {
    ...status,
    expectations: Array.from(status.expectations.entries()),
    early: Array.from(status.early.entries()),
  };
}
