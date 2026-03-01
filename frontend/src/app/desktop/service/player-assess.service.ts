import { Injectable } from "@angular/core";
import { Note } from "@tonejs/midi/dist/Note";
import { MidiStateEvent } from "../../shared/model/webmidi";
import { CursorService } from "./cursor.service";


export const GOOD_RANGE = 600 / 1000
export const PERFECT_RANGE = 200 / 1000
export const QUANT_RANGE = 100 / 1000

export interface LiveStatus {
  shouldPause: boolean;
  expectations: Map<number, Set<string>>;
  early: Map<number, Set<string>>;
  bad: number | null;
  total: number;
  badCount: number;
  late: number;
}

/**
 * Service responsible for user input assessment
 */
@Injectable({
  providedIn: 'root'
})
export class PlayerAssessService {

  constructor(private cursorService: CursorService) {
  }


  liveStatus: LiveStatus = {
    shouldPause: false,
    expectations: new Map<number, Set<string>>(),
    early: new Map<number, Set<string>>(),
    bad: null,
    total: 0,
    badCount: 0,
    late: 0,
  };

  reset() {
    this.liveStatus = {
      shouldPause: false,
      expectations: new Map<number, Set<string>>(),
      bad: null,
      early: new Map<number, Set<string>>(),
      total: 0,
      badCount: 0,
      late: 0,
    }
  }

  learnExpectation(noteTimeStart: number, noteTimeEnd: number, note: Note, hand: string): LiveStatus {
    if (!this.liveStatus.expectations.has(noteTimeStart)) {
      this.liveStatus.expectations.set(noteTimeStart, new Set<string>());
    }
    const setAt = this.liveStatus.expectations.get(noteTimeStart)!;
    const key = `${hand}:${note.midi}`;

    if (!setAt.has(key) && this.cursorService.midiTicksToOsmdCursorIndex.get(note.ticks) != null) {
      setAt.add(key);
    } else {
      if (this.liveStatus.expectations.get(noteTimeStart)?.size === 0) {
        this.liveStatus.expectations.delete(noteTimeStart);
      }
    }
    this.cleanEarly(noteTimeStart);
    this.checkExpectationsInEarly(noteTimeStart);
    this.checkShouldPause();
    return this.liveStatus;
  }

  cleanEarly(noteTimeStart: number) {
    const earlyKeys = Array.from(this.liveStatus.early.keys()).filter(k => k < noteTimeStart - GOOD_RANGE);
    for (const key of earlyKeys) {
      this.liveStatus.early.delete(key);
    }
  }

  getExpectation(): LiveStatus {
    this.checkShouldPause();
    return this.liveStatus;
  }

  getNewActual(midiEvent: MidiStateEvent): LiveStatus | null {
    this.liveStatus.bad = null;
    if (!this.maybeRemovePitchFromExpectations(midiEvent.note)) {
      this.liveStatus.bad = midiEvent.note;
      this.liveStatus.badCount += 1;
      if (!this.liveStatus.early.has(midiEvent.time)) {
        this.liveStatus.early.set(midiEvent.time, new Set<string>());
      }
      const earlyKey = `rh:${midiEvent.note}`;
      const earlySet = this.liveStatus.early.get(midiEvent.time)!;
      if (!earlySet.has(earlyKey)) {
        earlySet.add(earlyKey);
      }
    }
    this.checkShouldPause();
    return this.liveStatus;
  }

  maybeRemovePitchFromExpectations(pitch: number): boolean {
    let gotIt = false;
    const keys = Array.from(this.liveStatus.expectations.keys());
    const oldestKey = Math.min(...keys);
    const oldestValue = this.liveStatus.expectations.get(oldestKey);
    if (oldestValue) {
      let foundStr: string | undefined;
      for (const s of oldestValue) {
        const parts = s.split(':');
        const midi = parseInt(parts[1], 10);
        if (midi === pitch) {
          foundStr = s;
          break;
        }
      }
      if (foundStr) {
        gotIt = true;
        oldestValue.delete(foundStr);
        if (oldestValue.size === 0) {
          this.liveStatus.expectations.delete(oldestKey);
        } else {
          this.liveStatus.expectations.set(oldestKey, oldestValue);
        }
      }
    }
    return gotIt;
  }

  checkExpectationsInEarly(noteTimeStart: number) {
    for (const [earlyTime, earlyNotes] of this.liveStatus.early) {
      for (const earlyNote of Array.from(earlyNotes)) {
        try {
          const parts = earlyNote.split(':');
          const midi = parseInt(parts[1], 10);
          if (this.maybeRemovePitchFromExpectations(midi)) {
            earlyNotes.delete(earlyNote);
            if (earlyNotes.size === 0) {
              this.liveStatus.early.delete(earlyTime);
            }
          }
        } catch (e) {
          this.liveStatus.early = new Map<number, Set<string>>();
          console.error("Error in checkExpectationsInEarly", e);
        }
      }
    };
  }

  checkShouldPause() {
    const previousShouldPause = this.liveStatus.shouldPause;
    this.liveStatus.shouldPause = this.liveStatus.expectations.size > 0;
    if (!previousShouldPause && this.liveStatus.shouldPause) {
      this.liveStatus.late += 1;
    }
  }

}
