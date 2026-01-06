import { Injectable } from "@angular/core";
import { Note } from "@tonejs/midi/dist/Note";
import { MidiStateEvent } from "../../shared/model/webmidi";


export const GOOD_RANGE = 300 / 1000
export const PERFECT_RANGE = 50 / 1000
export const QUANT_RANGE = 40 / 1000

export interface LiveStatus {
  shouldPause: boolean;
  expectations: Map<number, [string, number][]>;
  bad: number | null;
  total: number;
  badCount: number;
  late: number;
}

/**
 * Service responsible for managing repetitions and navigation in the score
 */
@Injectable({
  providedIn: 'root'
})
export class PlayerAssessService {


  liveStatus: LiveStatus = {
    shouldPause: false,
    expectations: new Map<number, [string, number][]>(),
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
    this.checkShouldPause();
    return this.liveStatus;
  }

  getExpectation(): LiveStatus {
    this.checkShouldPause();
    return this.liveStatus;
  }

  getNewActual(midiEvent: MidiStateEvent): LiveStatus | null {

    this.liveStatus.bad = null;
    const keys = Array.from(this.liveStatus.expectations.keys());
    const oldestKey = Math.min(...keys);
    const oldestValue = this.liveStatus.expectations.get(oldestKey);
    if (oldestValue && oldestValue.map((v: [string, number]) => v[1]).includes(midiEvent.note)) {
      // remove from oldestValue
      oldestValue.splice(oldestValue.findIndex((v: [string, number]) => v[1] === midiEvent.note), 1);
      if (oldestValue.length === 0) {
        this.liveStatus.expectations.delete(oldestKey);
      } else {
        this.liveStatus.expectations.set(oldestKey, oldestValue);
      }
    } else {
      this.liveStatus.bad = midiEvent.note;
      this.liveStatus.badCount += 1;
    }
    this.checkShouldPause();
    return this.liveStatus;
  }

  checkShouldPause() {
    const previousShouldPause = this.liveStatus.shouldPause;
    this.liveStatus.shouldPause = this.liveStatus.expectations.size > 0;
    if (!previousShouldPause && this.liveStatus.shouldPause) {
      this.liveStatus.late += 1;
    }
  }

}