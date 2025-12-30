import { Injectable } from "@angular/core";
import { Note } from "@tonejs/midi/dist/Note";
import { MidiStateEvent } from "../../shared/model/webmidi";


export const GOOD_RANGE = 300 / 1000
export const PERFECT_RANGE = 50 / 1000
export const QUANT_RANGE = 40 / 1000

export interface LiveStatus {
  shouldPause: boolean;
  expectations: { [key: number]: [string, number][] };
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


  EVENT_DOWN = 'down' as MidiStateEvent['type']
  EVENT_UP = 'up' as MidiStateEvent['type']

  liveStatus: LiveStatus = {
    shouldPause: false,
    expectations: {},
    bad: null,
    total: 0,
    badCount: 0,
    late: 0,
  };

  reset() {
    this.liveStatus = {
      shouldPause: false,
      expectations: {},
      bad: null,
      total: 0,
      badCount: 0,
      late: 0,
    }
  }

  clearMissedNotes() {
    //this.liveStatus.missed = [];
  }

  learnExpectation(noteTimeStart: number, noteTimeEnd: number, note: Note, hand: string): LiveStatus {
    //const roundedTime = Math.round(exp.time / QUANT_RANGE) * QUANT_RANGE;
    if (!(noteTimeStart in this.liveStatus.expectations)) {
      this.liveStatus.expectations[noteTimeStart] = [];
    }
    this.liveStatus.expectations[noteTimeStart].push([hand, note.midi]);
    this.checkShouldPause();
    return this.liveStatus;
  }

  getExpectation(): LiveStatus {
    this.checkShouldPause();
    return this.liveStatus;
  }

  getNewActual(midiEvent: MidiStateEvent): LiveStatus | null {
    if (midiEvent.type !== this.EVENT_DOWN && midiEvent.type !== this.EVENT_UP) {
      return null;
    }
    if (midiEvent.type === this.EVENT_UP) {
      return null;
    }
    this.liveStatus.bad = null;
    const keys = Object.keys(this.liveStatus.expectations).map(Number);
    const oldestKey = Math.min(...keys);
    const oldestValue = this.liveStatus.expectations[oldestKey];
    if (oldestValue && oldestValue.map(v => v[1]).includes(midiEvent.note)) {
      // remove from oldestValue
      oldestValue.splice(oldestValue.findIndex(v => v[1] === midiEvent.note), 1);
      if (oldestValue.length === 0) {
        delete this.liveStatus.expectations[oldestKey];
      } else {
        this.liveStatus.expectations[oldestKey] = oldestValue;
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
    this.liveStatus.shouldPause = Object.keys(this.liveStatus.expectations).length > 0;
    if (!previousShouldPause && this.liveStatus.shouldPause) {
      this.liveStatus.late += 1;
    }
  }

}