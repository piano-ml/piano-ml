import { Injectable } from "@angular/core";
import { Note } from "@tonejs/midi/dist/Note";
import { MidiStateEvent } from "../../shared/model/webmidi";


export const GOOD_RANGE = 120 / 1000
export const PERFECT_RANGE = 40 / 1000
export const QUANT_RANGE = 40 / 1000

export interface LiveStatus {
  shouldPause: boolean;
  expectations: { hand: string; note: Note }[];
  missed: MidiStateEvent[];
  bad: MidiStateEvent | null;
  early: MidiStateEvent[];
  good: MidiStateEvent[];
  perfect: MidiStateEvent[];
}

/**
 * Service responsible for managing repetitions and navigation in the score
 */
@Injectable({
  providedIn: 'root'
})
export class PlayerAssessService {

  expectations: (MidiStateEvent & { hand: string })[] = [];
  actuals: MidiStateEvent[] = [];
  EVENT_DOWN = 'down' as MidiStateEvent['type']
  EVENT_UP = 'up' as MidiStateEvent['type']
  liveStatus: LiveStatus = {
    shouldPause: false,
    expectations: [],
    missed: [],
    bad: null,
    early: [],
    good: [],
    perfect: []
  };

  reset() {
    this.expectations = [];
    this.actuals = [];
  }

  learnExpectation(noteTimeStart: number, noteTimeEnd: number, note: Note, hand: string): LiveStatus {
    const midiEventStart = {
      note: note.midi,
      type: this.EVENT_DOWN,
      time: noteTimeStart,
      hand: hand
    };

    this.expectations.push(midiEventStart);
    this.liveStatus.expectations = this.expectations.map(e => ({
      hand: e.hand,
      note: { midi: e.note, time: e.time } as Note
    })).sort((a, b) => a.note.midi - b.note.midi).sort((a, b) => a.note.time - b.note.time);

    // should pause if there are still expectations not in GOOD_RANGE time
    this.liveStatus.shouldPause = this.expectations.filter(e => Math.abs(e.time - noteTimeStart) > GOOD_RANGE).length > 0;

    return this.liveStatus;
  }

  getExpectation(): LiveStatus {
    this.liveStatus.shouldPause = this.expectations.length > 0;
    this.liveStatus.expectations = this.expectations.map(e => ({
      hand: e.hand,
      note: { midi: e.note, time: Math.round(e.time / PERFECT_RANGE) * PERFECT_RANGE } as Note
    })).sort((a, b) => a.note.midi - b.note.midi).sort((a, b) => a.note.time - b.note.time);
    return this.liveStatus;
  }




  getNewActual(midiEvent: MidiStateEvent): LiveStatus {
    if (midiEvent.type !== this.EVENT_DOWN && midiEvent.type !== this.EVENT_UP) {
      return this.liveStatus;
    }

    if (midiEvent.type === this.EVENT_UP) {
      return this.liveStatus;
    }

    this.actuals.push(midiEvent);
    // remove from expectations note that match midi and are within good range or on top of the list
    const expectationsBefore = this.expectations.length;

    // build a map of expectations where key is the time rounded to nearest PERFECT_RANGE
    const expectationMap = new Map<number, (MidiStateEvent & { hand: string })[]>();
    for (const exp of this.expectations) {
      const roundedTime = Math.round(exp.time / QUANT_RANGE) * QUANT_RANGE;
      const existing = expectationMap.get(roundedTime) || [];
      existing.push(exp);
      expectationMap.set(roundedTime, existing);
    }

    // set found to true of midiEvent match the lowest key in expectationMap
    const lowestKey = Math.min(...expectationMap.keys());
    const matchedExpectations = expectationMap.get(lowestKey) || [];

    const found = matchedExpectations.find(e => e.note === midiEvent.note);

    // if found = true remove the first elements of expectations
    if (found) {
      this.expectations = this.expectations.filter(e => e !== found);
    }

    this.liveStatus.bad = null;
    if (this.expectations.length === expectationsBefore) {
      // no match found, classify as bad or early
      const firstExpectation = this.expectations[0];
      if (firstExpectation && midiEvent.time < firstExpectation.time) {
        this.liveStatus.early.push(midiEvent);
      } else {
        this.liveStatus.bad = midiEvent;

      }
    }
    if (this.expectations[0]?.note === midiEvent.note) this.expectations.shift();
    // should pause if there are still expectations not in GOOD_RANGE time
    this.liveStatus.expectations = this.expectations.map(e => ({
      hand: e.hand,
      note: { midi: e.note, time: Math.round(e.time / PERFECT_RANGE) * PERFECT_RANGE } as Note
    })).sort((a, b) => a.note.midi - b.note.midi).sort((a, b) => a.note.time - b.note.time);
    this.liveStatus.shouldPause = this.expectations.filter(e => Math.abs(e.time - midiEvent.time) > GOOD_RANGE).length > 0;
    return this.liveStatus;
  }

}