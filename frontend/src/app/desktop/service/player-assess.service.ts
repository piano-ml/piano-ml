import { Injectable } from "@angular/core";
import { Note } from "@tonejs/midi/dist/Note";
import { MidiStateEvent } from "../../shared/model/webmidi";
import { forEach } from "lodash";


export const GOOD_RANGE = 300 / 1000
export const PERFECT_RANGE = 50 / 1000
export const QUANT_RANGE = 40 / 1000

export interface LiveStatus {
  shouldPause: boolean;
  expectations: Map<number, [string, number][]>;
  early: Map<number, [string, number][]>;
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


  liveStatus: LiveStatus = {
    shouldPause: false,
    expectations: new Map<number, [string, number][]>(),
    early: new Map<number, [string, number][]>(),
    bad: null,  
    total: 0,
    badCount: 0,
    late: 0,
  };

  reset() {
    this.liveStatus = {
      shouldPause: false,
      expectations: new Map<number, [string, number][]>(),
      bad: null,
      early: new Map<number, [string, number][]>(),
      total: 0,
      badCount: 0,
      late: 0,
    }
  }

  learnExpectation(noteTimeStart: number, noteTimeEnd: number, note: Note, hand: string): LiveStatus {
    if (!this.liveStatus.expectations.has(noteTimeStart)) {
      this.liveStatus.expectations.set(noteTimeStart, []);
    }
    this.liveStatus.expectations.get(noteTimeStart)!.push([hand, note.midi]);
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
        this.liveStatus.early.set(midiEvent.time, []);
      }
      this.liveStatus.early.get(midiEvent.time)!.push(['rh', midiEvent.note]);
    }
    this.checkShouldPause();
    return this.liveStatus;
  }

  maybeRemovePitchFromExpectations(pitch: number): boolean {
    let gotIt = false;  
    const keys = Array.from(this.liveStatus.expectations.keys());
    const oldestKey = Math.min(...keys);
    const oldestValue = this.liveStatus.expectations.get(oldestKey);
    if (oldestValue && oldestValue.map((v: [string, number]) => v[1]).includes(pitch)) {
      gotIt = true;
      // remove from oldestValue
      oldestValue.splice(oldestValue.findIndex((v: [string, number]) => v[1] === pitch), 1);
      if (oldestValue.length === 0) {
        this.liveStatus.expectations.delete(oldestKey);
      } else {
        this.liveStatus.expectations.set(oldestKey, oldestValue);
      }
    } 
    return gotIt;
  }

  checkExpectationsInEarly(noteTimeStart: number) {
    for (const [earlyTime, earlyNotes] of this.liveStatus.early) {
      forEach(earlyNotes, (earlyNote) => {
        if (this.maybeRemovePitchFromExpectations(earlyNote[1])) {
          // remove from earlyNotes
          earlyNotes.splice(earlyNotes.findIndex((v: [string, number]) => v[1] === earlyNote[1]), 1);
          if (earlyNotes.length === 0) {
            this.liveStatus.early.delete(earlyTime);
          }
        }
      });
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
