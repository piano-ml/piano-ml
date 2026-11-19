import { Injectable, OnDestroy } from "@angular/core";
import { Note } from "@tonejs/midi/dist/Note";
import { MidiStateEvent } from "../../shared/model/webmidi";
import { CursorService } from "./cursor.service";


/**
 * A note played within ±GOOD_RANGE seconds of its due time is in time (a hit): ±120 ms, the end of the
 * "Okay / Borderline" category below.
 *
 * Category           | Timing deviation (absolute value) | What it feels/sounds like                                 | Practical advice for beginners
 * Perfect            | 0 – 40 ms                         | Feels locked in, very solid                               | Ideal target when practicing slowly with a metronome
 * Good / Acceptable  | 40 – 80 ms                        | Still sounds “in time” to most listeners                  | Completely fine for beginners; keep practicing toward the perfect range
 * Okay / Borderline  | 80 – 120 ms                       | Slightly early or late, noticeable if you listen carefully | Workable while learning a piece, but try to tighten it
 */
export const GOOD_RANGE = 120 / 1000
export const PERFECT_RANGE = 200 / 1000
export const QUANT_RANGE = 100 / 1000

export interface NoteKey {
  hand: string;
  midi: number;
}

export interface LiveStatus {
  shouldPause: boolean;
  expectations: Map<number, Set<NoteKey>>;
  early: Map<number, Set<NoteKey>>;
  bad: number | null;
  /** Notes expected so far. */
  total: number;
  badCount: number;
  late: number;
}

/** What a take is assessed on. Notes are those of the hand(s) the player waits for. */
export interface AssessCounters {
  /** Notes the user was expected to play. */
  expected: number;
  /** Expected notes that were played. */
  hit: number;
  /** Notes played that were not expected (a note played early and matched afterwards is not wrong). */
  wrong: number;
  /** Expected note or chord onsets. */
  onsets: number;
  /** Onsets completed more than GOOD_RANGE after they were due: playback had to wait for the user. */
  waits: number;
}

export interface MeasureCounters extends AssessCounters {
  /** 1-based measure of the MIDI (repeats unrolled). */
  measure: number;
}

/** Immutable copy of the counters of the current take. */
export interface AssessSnapshot extends AssessCounters {
  measures: MeasureCounters[];
  /** Keys the user pressed during the take, right or wrong (not sent: it decides whether the take is assessed). */
  played: number;
}

/** A score note due at a transport time, in play-along mode: the user may play it within ±GOOD_RANGE. */
interface TimedExpectation {
  /** Transport seconds, count-in included. */
  time: number;
  midi: number;
  hand: string;
  measure: number | undefined;
  hit: boolean;
  /** Counted as expected: when played, or once its window closed unplayed (missed). */
  counted: boolean;
}

/** 1-based measure of a note: `bars` is its 0-based measure position in the MIDI. */
const measureOf = (note: Note): number | undefined => Number.isFinite(note.bars) ? Math.floor(note.bars) + 1 : undefined;

const emptyCounters = (): AssessCounters => ({ expected: 0, hit: 0, wrong: 0, onsets: 0, waits: 0 });

/**
 * Service responsible for user input assessment
 */
@Injectable({
  providedIn: 'root'
})
export class PlayerAssessService implements OnDestroy {

  private cachedOldestKey: number | null = null;

  // Counters of the current take (see snapshot()). Kept beside liveStatus, which drives playback.
  private counters: AssessCounters = emptyCounters();
  private measureCounters = new Map<number, AssessCounters>();
  /** Measure of each pending expectation and of each early (so far wrong) note. */
  private measureOfKey = new WeakMap<NoteKey, number>();
  /** When each pending onset became due (ms), by its expectation time. */
  private onsetDueAt = new Map<number, { at: number; measure: number | undefined }>();
  private countedOnsets = new Set<number>();
  private lastMeasure: number | undefined;
  private played = 0;

  // Play-along assessment (expectTimed / playTimed): score notes by due time, matched with key presses
  private timed: TimedExpectation[] = [];
  /** expectTimed() appends; the array is sorted by time before the next lookup. */
  private timedSorted = true;
  /** Every expectation before this index has had its window closed and was counted. */
  private settledIndex = 0;
  private countedTimedOnsets = new Set<number>();
  /** Transport seconds, as the synth sounds the notes (Tone's lookahead included). */
  private clock: () => number = () => 0;

  constructor(
    private cursorService: CursorService,
  ) {
  }


  liveStatus: LiveStatus = {
    shouldPause: false,
    expectations: new Map<number, Set<NoteKey>>(),
    early: new Map<number, Set<NoteKey>>(),
    bad: null,
    total: 0,
    badCount: 0,
    late: 0,
  };

  reset() {
    this.liveStatus = {
      shouldPause: false,
      expectations: new Map<number, Set<NoteKey>>(),
      bad: null,
      early: new Map<number, Set<NoteKey>>(),
      total: 0,
      badCount: 0,
      late: 0,
    }
    this.cachedOldestKey = null;
    this.counters = emptyCounters();
    this.measureCounters.clear();
    this.measureOfKey = new WeakMap<NoteKey, number>();
    this.onsetDueAt.clear();
    this.countedOnsets.clear();
    this.lastMeasure = undefined;
    this.played = 0;
    this.timed = [];
    this.timedSorted = true;
    this.settledIndex = 0;
    this.countedTimedOnsets.clear();
  }

  /** Where playTimed() and the closing of windows read the time. */
  setClock(clock: () => number): void {
    this.clock = clock;
  }

  /** Play-along mode: the score note `note` is due at transport `time` (seconds, count-in included). */
  expectTimed(time: number, note: Note, hand: string): void {
    const last = this.timed[this.timed.length - 1];
    if (last && time < last.time) {
      this.timedSorted = false; // the second hand is scheduled after the first
    }
    this.timed.push({ time, midi: note.midi, hand, measure: measureOf(note), hit: false, counted: false });
  }

  /**
   * Playback (re)starts at transport `from`: Play after Pause resumes where the transport stopped, while every
   * note of the range was scheduled again. Notes the user never got to play are dropped, not counted as missed.
   */
  beginTimed(from: number): void {
    this.sortTimed();
    const first = this.lowerBound(from - GOOD_RANGE);
    if (first > 0) {
      this.timed.splice(0, first);
      this.settledIndex = Math.max(0, this.settledIndex - first);
    }
  }

  /** The take reached the end of its range: every note still unplayed is missed, open window or not. */
  endTimed(): void {
    this.sortTimed();
    for (; this.settledIndex < this.timed.length; this.settledIndex++) {
      const expectation = this.timed[this.settledIndex];
      if (!expectation.counted) {
        this.countTimed(expectation);
      }
    }
  }

  /**
   * Play-along mode: the user pressed `pitch` at transport `now`. It hits the closest unplayed score note of that
   * pitch due within ±GOOD_RANGE; otherwise it is a wrong note.
   */
  playTimed(now: number, pitch: number): { bad: boolean } {
    this.settleTimed();
    this.played += 1;
    let best: TimedExpectation | undefined;
    for (let i = this.lowerBound(now - GOOD_RANGE); i < this.timed.length && this.timed[i].time <= now + GOOD_RANGE; i++) {
      const candidate = this.timed[i];
      if (!candidate.hit && candidate.midi === pitch
        && (!best || Math.abs(candidate.time - now) < Math.abs(best.time - now))) {
        best = candidate;
      }
    }
    if (best) {
      if (!best.counted) {
        this.countTimed(best);
      }
      best.hit = true;
      this.count('hit', best.measure, 1);
      return { bad: false };
    }
    this.count('wrong', this.nearestTimedMeasure(now) ?? this.lastMeasure, 1);
    return { bad: true };
  }

  /** Counts as expected (missed so far) every note whose window has closed. */
  private settleTimed(): void {
    this.sortTimed();
    const now = this.clock();
    for (; this.settledIndex < this.timed.length && this.timed[this.settledIndex].time + GOOD_RANGE < now; this.settledIndex++) {
      const expectation = this.timed[this.settledIndex];
      if (!expectation.counted) {
        this.countTimed(expectation);
      }
    }
  }

  private countTimed(expectation: TimedExpectation): void {
    expectation.counted = true;
    if (expectation.measure !== undefined) {
      this.lastMeasure = expectation.measure;
    }
    this.count('expected', expectation.measure, 1);
    if (!this.countedTimedOnsets.has(expectation.time)) {
      this.countedTimedOnsets.add(expectation.time);
      this.count('onsets', expectation.measure, 1);
    }
  }

  private sortTimed(): void {
    if (!this.timedSorted) {
      this.timed.sort((a, b) => a.time - b.time);
      this.timedSorted = true;
      this.settledIndex = 0; // the counted flags keep the walk from counting twice
    }
  }

  /** Index of the first expectation due at `time` or later (binary search). */
  private lowerBound(time: number): number {
    let lo = 0;
    let hi = this.timed.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (this.timed[mid].time < time) {
        lo = mid + 1;
      } else {
        hi = mid;
      }
    }
    return lo;
  }

  /** Measure of the score note due nearest to `time`. */
  private nearestTimedMeasure(time: number): number | undefined {
    const next = this.lowerBound(time);
    const after = this.timed[next];
    const before = this.timed[next - 1];
    const nearest = !before ? after : !after ? before : (after.time - time < time - before.time ? after : before);
    return nearest?.measure;
  }

  learnExpectation(noteTimeStart: number, noteTimeEnd: number, note: Note, hand: string): LiveStatus {
    let setAt = this.liveStatus.expectations.get(noteTimeStart);
    if (!setAt) {
      setAt = new Set<NoteKey>();
      this.liveStatus.expectations.set(noteTimeStart, setAt);
      this.cachedOldestKey = null; // invalidate cache when expectations change
    }
    
    const noteKey: NoteKey = { hand, midi: note.midi };
    const keyExists = Array.from(setAt).some(k => k.hand === hand && k.midi === note.midi);

    if (!keyExists && this.cursorService.midiTicksToOsmdCursorIndex.get(note.ticks) != null) {
      setAt.add(noteKey);
      this.countExpected(noteTimeStart, noteKey, note);
    } else {
      if (setAt.size === 0) {
        this.liveStatus.expectations.delete(noteTimeStart);
        this.cachedOldestKey = null; // invalidate cache
      }
    }
    this.cleanEarly(noteTimeStart);
    this.checkExpectationsInEarly(noteTimeStart);
    this.checkShouldPause();
    return this.liveStatus;
  }

  cleanEarly(noteTimeStart: number) {
    const threshold = noteTimeStart - GOOD_RANGE;
    for (const key of this.liveStatus.early.keys()) {
      if (key < threshold) {
        this.liveStatus.early.delete(key);
      }
    }
  }

  getExpectation(): LiveStatus {
    this.checkShouldPause();
    return this.liveStatus;
  }

  getNewActual(audioTime: number, midiEvent: MidiStateEvent): LiveStatus | null {
    this.played += 1;
    this.liveStatus.bad = null;
    if (!this.maybeRemovePitchFromExpectations(midiEvent.note)) {
      this.liveStatus.bad = midiEvent.note;
      this.liveStatus.badCount += 1;
      const wrongMeasure = this.pendingMeasure();
      this.count('wrong', wrongMeasure, 1);
      let earlySet = this.liveStatus.early.get(midiEvent.time);
      if (!earlySet) {
        earlySet = new Set<NoteKey>();
        this.liveStatus.early.set(midiEvent.time, earlySet);
      }
      const earlyKey: NoteKey = { hand: 'rh', midi: midiEvent.note };
      const keyExists = Array.from(earlySet).some(k => k.hand === 'rh' && k.midi === midiEvent.note);
      if (!keyExists) {
        earlySet.add(earlyKey);
        if (wrongMeasure !== undefined) {
          this.measureOfKey.set(earlyKey, wrongMeasure);
        }
      }
    }
    this.checkShouldPause();
    return this.liveStatus;
  }

  /** The counters of the current take: everything since the last reset(). */
  snapshot(): AssessSnapshot {
    this.settleTimed();
    const measures = Array.from(this.measureCounters.entries())
      .sort(([a], [b]) => a - b)
      .map(([measure, counters]) => ({ measure, ...counters }));
    return { ...this.counters, measures, played: this.played };
  }

  /** Wall clock in milliseconds; a method so that specs can drive time. */
  protected now(): number {
    return Date.now();
  }

  private count(counter: keyof AssessCounters, measure: number | undefined, delta: number): void {
    this.counters[counter] = Math.max(0, this.counters[counter] + delta);
    if (measure === undefined) {
      return;
    }
    let counters = this.measureCounters.get(measure);
    if (!counters) {
      counters = emptyCounters();
      this.measureCounters.set(measure, counters);
    }
    counters[counter] = Math.max(0, counters[counter] + delta);
  }

  private countExpected(noteTimeStart: number, noteKey: NoteKey, note: Note): void {
    const measure = measureOf(note);
    if (measure !== undefined) {
      this.measureOfKey.set(noteKey, measure);
      this.lastMeasure = measure;
    }
    this.liveStatus.total += 1;
    this.count('expected', measure, 1);
    if (!this.countedOnsets.has(noteTimeStart)) {
      this.countedOnsets.add(noteTimeStart);
      this.onsetDueAt.set(noteTimeStart, { at: this.now(), measure });
      this.count('onsets', measure, 1);
    }
  }

  /** An onset has all its notes: it was a wait if that took longer than GOOD_RANGE. */
  private onsetCompleted(noteTimeStart: number): void {
    const due = this.onsetDueAt.get(noteTimeStart);
    if (!due) {
      return;
    }
    this.onsetDueAt.delete(noteTimeStart);
    if (this.now() - due.at > GOOD_RANGE * 1000) {
      this.count('waits', due.measure, 1);
    }
  }

  /** Measure a wrong note belongs to: the one being waited for, else the last one played. */
  private pendingMeasure(): number | undefined {
    for (const due of this.onsetDueAt.values()) {
      if (due.measure !== undefined) {
        return due.measure;
      }
    }
    return this.lastMeasure;
  }


  maybeRemovePitchFromExpectations(pitch: number): boolean {
    // Use cached oldest key or compute it
    if (this.cachedOldestKey === null && this.liveStatus.expectations.size > 0) {
      this.cachedOldestKey = Math.min(...Array.from(this.liveStatus.expectations.keys()));
    }
    
    if (this.cachedOldestKey === null) return false;

    const oldestValue = this.liveStatus.expectations.get(this.cachedOldestKey);
    if (!oldestValue) return false;

    let foundKey: NoteKey | null = null;
    for (const noteKey of oldestValue) {
      if (noteKey.midi === pitch) {
        foundKey = noteKey;
        break;
      }
    }

    if (foundKey) {
      oldestValue.delete(foundKey);
      this.count('hit', this.measureOfKey.get(foundKey), 1);
      if (oldestValue.size === 0) {
        this.liveStatus.expectations.delete(this.cachedOldestKey);
        this.onsetCompleted(this.cachedOldestKey);
        this.cachedOldestKey = null; // invalidate cache
      }
      return true;
    }
    return false;
  }

  checkExpectationsInEarly(noteTimeStart: number) {
    for (const [earlyTime, earlyNotes] of this.liveStatus.early) {
      const notesToDelete: NoteKey[] = [];
      for (const earlyNote of earlyNotes) {
        if (this.maybeRemovePitchFromExpectations(earlyNote.midi)) {
          notesToDelete.push(earlyNote);
          // Played ahead of the score, not wrong: take back the wrong note counted when it was played
          this.count('wrong', this.measureOfKey.get(earlyNote), -1);
        }
      }
      // Delete collected notes after iteration
      for (const noteKey of notesToDelete) {
        earlyNotes.delete(noteKey);
      }
      if (earlyNotes.size === 0) {
        this.liveStatus.early.delete(earlyTime);
      }
    }
  }

  checkShouldPause() {
    const previousShouldPause = this.liveStatus.shouldPause;
    this.liveStatus.shouldPause = this.liveStatus.expectations.size > 0;
    if (!previousShouldPause && this.liveStatus.shouldPause) {
      this.liveStatus.late += 1;
    }
  }

  ngOnDestroy(): void {
    // Clear all Maps and Sets to release references
    this.liveStatus.expectations.clear();
    this.liveStatus.early.clear();
    this.cachedOldestKey = null;
    this.measureCounters.clear();
    this.timed = [];
    this.onsetDueAt.clear();
    this.countedOnsets.clear();
  }

}
