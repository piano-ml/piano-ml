import { Injectable, OnDestroy } from "@angular/core";
import { Note } from "@tonejs/midi/dist/Note";
import { MidiStateEvent } from "../../shared/model/webmidi";
import { CursorService } from "./cursor.service";
import { PlayerAudioService } from "./player-audio.service";


export const GOOD_RANGE = 600 / 1000
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
export class PlayerAssessService implements OnDestroy {

  private cachedOldestKey: number | null = null;
  private unHitNotesByTime: Map<number, { pitch: number, hit: boolean }[]> = new Map();

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
    // Initialize unHitNotesByTime with all notes from audioTimeNoteArray
    this.unHitNotesByTime.clear();
    for (const [t, notes] of this.cursorService.audioTimeNoteArray) {
      const unHitNotes = notes.filter(n => !n.hit);
      if (unHitNotes.length > 0) {
        this.unHitNotesByTime.set(t, unHitNotes);
      }
    }
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
    this.liveStatus.bad = null;
    if (!this.maybeRemovePitchFromExpectations(midiEvent.note)) {
      this.liveStatus.bad = midiEvent.note;
      this.liveStatus.badCount += 1;
      let earlySet = this.liveStatus.early.get(midiEvent.time);
      if (!earlySet) {
        earlySet = new Set<NoteKey>();
        this.liveStatus.early.set(midiEvent.time, earlySet);
      }
      const earlyKey: NoteKey = { hand: 'rh', midi: midiEvent.note };
      const keyExists = Array.from(earlySet).some(k => k.hand === 'rh' && k.midi === midiEvent.note);
      if (!keyExists) {
        earlySet.add(earlyKey);
      }
    }
    this.checkShouldPause();
    return this.liveStatus;
  }


  /**
   * Retourne toutes les notes attendues dans l'intervalle [audioTime - range, audioTime + range]
   * Utilise une structure pré-filtrée des notes unhit pour éviter de filter à chaque appel
   */
  getNotesInRange(audioTime: number, range: number): { pitch: number, hit: boolean }[] {
    const result: { pitch: number, hit: boolean }[] = [];
    const minTime = audioTime - range;
    const maxTime = audioTime + range;
    
    for (const [t, notes] of this.unHitNotesByTime) {
      if (t < minTime) continue;
      if (t > maxTime) break;
      result.push(...notes);
    }
    return result;
  }

  isNoteInTime(midiEvent: MidiStateEvent, audioTime: number): boolean {
    const possibleNotes = this.getNotesInRange(audioTime, GOOD_RANGE);
    for (const possibleNote of possibleNotes) {
      if (possibleNote.pitch === midiEvent.note && possibleNote.hit === false) {
        possibleNote.hit = true;
        // Remove note from pre-filtered unhit map
        this.removeNoteFromUnHitMap(possibleNote);
        return true;
      }
    }
    return false;
  }

  private removeNoteFromUnHitMap(note: { pitch: number, hit: boolean }): void {
    for (const [t, notes] of this.unHitNotesByTime) {
      const index = notes.indexOf(note);
      if (index >= 0) {
        notes.splice(index, 1);
        if (notes.length === 0) {
          this.unHitNotesByTime.delete(t);
        }
        return;
      }
    }
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
      if (oldestValue.size === 0) {
        this.liveStatus.expectations.delete(this.cachedOldestKey);
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
    this.unHitNotesByTime.clear();
    this.cachedOldestKey = null;
  }

}
