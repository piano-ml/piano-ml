import { Note } from '@tonejs/midi/dist/Note';
// biome-ignore lint/style/useImportType: <explanation>
import * as Midi from '@tonejs/midi';
import { addFractions, compareFractions, type ReducedFraction, reducedFractionfromTicks, subtractFractions } from '../model/reduced-fraction';






interface ChordSplitData {
  chord: [ReducedFraction, MidiChord];
  possibleSplits: SplitTry[];
}

interface SplitTry {
  prevSplitPoint: number;
}



interface MidiNote {
  ticks: number;
  pitch: number;
  offTime: ReducedFraction;
  velo: number;
  //staccato: boolean;
  //isInTuplet: boolean;
  //tuplet: Map<ReducedFraction, MidiTuplet>;
  //offTimeQuant: ReducedFraction;
  //origOnTime: ReducedFraction;
  //tie: Tie | null = null;
}


interface MidiTuplet {
  tupletData: object;
  // Définir les propriétés et méthodes de la classe TupletData si nécessaire
}

interface MidiChord {
  //  voice: number;
  notes: MidiNote[];
  //  isInTuplet: boolean;
  //  barIndex: number;
  //  tuplet: MidiTuplet;
}

interface SplitTry {
  penalty: number;
  prevSplitPoint: number;
}


export class HandDetectorService {

  RH = 0;
  LH = 1;
  ppq!: number;


  onsets!: { [onTime: number]: Note[] };
  //rightHandChords!: Map<ReducedFraction, MidiChord>;
  //leftHandChords!: Map<ReducedFraction, MidiChord>;
  rightHandChords2: MidiNote[][] = []
  leftHandChords2: MidiNote[][] = []
  doSplit: boolean;

  constructor(private midiObj: Midi.Midi, doStaffSplit: boolean) {
    this.doSplit = doStaffSplit;
    // import_midi.cpp L 1206
    // MChord::collectChords(tracks, { 2, 1 }, { 1, 2 });
    // MidiBeat::adjustChordsToBeats(tracks);
    // MChord::mergeChordsWithEqualOnTimeAndVoice(tracks);
    // MChord::removeOverlappingNotes(tracks);
    // LRHand::splitIntoLeftRightHands(tracks);
    //MChord::mergeChordsWithEqualOnTimeAndVoice(tracks);
    //Simplify::simplifyDurationsNotDrums(tracks, sigmap);
    this.ppq = this.midiObj.header.ppq;
    this.setupOnsets();
  }

  detectHand(notes: Note[]): { 0: Note[], 1: Note[] } {
    const rights: Note[] = []
    const lefts: Note[] = []

    for (let i = 0; i < notes.length; i++) {
      const note = notes[i];
      const pitch = note.midi;
      const onTime = note.ticks;
      const leftTest = ([] as MidiNote[])
        .concat(...this.leftHandChords2.filter(chord => chord[0].ticks === onTime))
        .filter(note => note.pitch === pitch)
      if (leftTest.length > 0) {
        lefts.push(note)
      } else {
        rights.push(note)
      }
    }
    return {
      0: rights,
      1: lefts
    }
  }

  singleNoteDetectHand(note: Note): string {
    const lr = this.detectHand([note])
    if (lr[0].length > 0) {
      return "rh"
    }
    return "lh"
  }

  doStaffSplit(): boolean {
    const midiWithHandSeparated = this.midiObj.tracks.length > 1
      && this.midiObj.tracks[0].notes.length > 0
      && this.midiObj.tracks[1].notes.length > 0;
    return this.doSplit
  }

  setupOnsets() {
    if (!this.doStaffSplit()) {
      return;
    }

    // pass 1:start building the onsets with note start time
    this.onsets = this.midiObj.tracks[0].notes.reduce(
      (result: { [key: number]: Note[] }, currentValue: Note) => {
        const onTime = currentValue.ticks;
        if (!result[onTime]) {
          result[onTime] = [];
        }
        result[onTime].push(currentValue);
        return result;
      }, {});

    // pass 1: add onsets for note that are stopping & fill the onsets with playong notes
    this.midiObj.tracks[0].notes.forEach((note: Note) => {
      const noteStartTime = note.ticks;
      const noteEndTime = note.ticks + note.durationTicks;
      if (!this.onsets[noteEndTime]) {
        this.onsets[noteEndTime] = [];
      }
      // find previous onset
      const targetOnsets = Object.entries(this.onsets)
        .filter(([key, _]) => Number(key) < noteEndTime)
        .filter(([key, _]) => Number(key) >= noteStartTime);
      targetOnsets.forEach(([key, notes]) => {
        if (!this.onsets[Number(key)].some((existingNote: Note) => existingNote.midi === note.midi)) {
          this.onsets[Number(key)].push(note);
        }
      });
    });

    Object.keys(this.onsets).forEach((key) => {
      if (this.onsets[Number(key)].length === 0) {
        delete this.onsets[Number(key)];
      }
    });

    // start voice separation
    const playing: Note[] = []
    for (const time in this.onsets) {
      for (let i = 0; i < playing.length; i++) {
        if (playing[i].ticks + playing[i].durationTicks <= Number(time)) {
          playing.splice(i, 1);
          i--;
        }
      }
      this.onsets[time].push(...playing)
      this.onsets[time] = this.onsets[time].filter((item,
        index) => this.onsets[time].indexOf(item) === index);

      this.onsets[time].sort((a, b) => a.midi - b.midi);
      playing.push(...this.onsets[time])
    }

    const rightHandChords: Map<ReducedFraction, MidiChord> = new Map();


    for (const time in this.onsets) {
      const notes = this.onsets[time]
      const chord = notes.map((note: Note) => {
        const midiNote: MidiNote = {
          pitch: note.midi,
          offTime: reducedFractionfromTicks(note.ticks + note.durationTicks , this.ppq),
          velo: note.velocity,
          ticks: note.ticks
        }
        return midiNote;
      });
      const midiChord: MidiChord = {
        notes: chord
      }
      rightHandChords.set(reducedFractionfromTicks(Number(time), this.ppq), midiChord)
    }
    const splits = this.findSplits(rightHandChords);
    const leftHandChords: Map<ReducedFraction, MidiChord> = new Map();
    this.splitChords(splits, leftHandChords, rightHandChords);
    this.leftHandChords2 = Array.from(leftHandChords, (value, _) => value[1].notes).sort((a, b) => a[0].ticks - b[0].ticks);
    this.rightHandChords2 = Array.from(rightHandChords, (value, _) => value[1].notes).sort((a, b) => a[0].ticks - b[0].ticks);
  }




  splitChords(
    splits: ChordSplitData[], // issue de findSplits
    leftHandChords: Map<ReducedFraction, MidiChord>, // empty at start
    chords: Map<ReducedFraction, MidiChord> // all chords sorted by pitch
  ): void {
    const REDUCED_FRACTION = 0;
    const CHORD = 1;
    if (splits.length !== chords.size) {
      throw new Error("Sizes of split data and chords don't match");
    }

    let splitPoint = this.findLastSplitPoint(splits);

    for (let pos = splits.length - 1; ; --pos) {
      const oldChord = splits[pos].chord[CHORD] //.midiChord;
      const newChord: MidiChord = { ...oldChord };

      if (splitPoint > 0 && splitPoint < oldChord.notes.length) {
        const oldNotes = oldChord.notes;

        oldChord.notes = [];
        for (let i = splitPoint; i < oldNotes.length; ++i) {
          oldChord.notes.push(oldNotes[i]);
        }

        newChord.notes = [];
        for (let i = 0; i < splitPoint; ++i) {
          newChord.notes.push(oldNotes[i]);
        }
        leftHandChords.set(splits[pos].chord[REDUCED_FRACTION], newChord);
      } else if (splitPoint === oldChord.notes.length) {
        leftHandChords.set(splits[pos].chord[REDUCED_FRACTION], newChord);
        chords.delete(splits[pos].chord[REDUCED_FRACTION]);
      }

      if (pos === 0) {
        break;
      }
      splitPoint = splits[pos].possibleSplits[splitPoint].prevSplitPoint;

    }
  }

  findSplits(chords: Map<ReducedFraction, MidiChord>): ChordSplitData[] {
    const splits: ChordSplitData[] = [];
    let pos = 0;
    let maxChordLen: ReducedFraction = { ticks: 0, numerator: 0, denominator: 1 };
    for (const [onTime, chord] of chords) {
      const notes = chord.notes;
      if (notes.length === 0) {
        throw new Error("Notes are empty");
      }
      if (!this.areNotesSortedByPitchInAscOrder(notes)) {
        throw new Error("Notes are not sorted by pitch in ascending order");
      }

      const len = subtractFractions(this.maxNoteOffTime(notes), onTime);
      if (compareFractions(len, maxChordLen) > 0) {
        maxChordLen = len;
      }

      const split: ChordSplitData = { chord: [onTime, chord], possibleSplits: [] };



      for (let splitPoint = 0; splitPoint <= notes.length; ++splitPoint) {
        const splitTry: SplitTry = {
          penalty: this.findPitchWidthPenalty(notes, splitPoint)
            + this.findDurationPenalty(notes, splitPoint)
            + this.findNoteCountPenalty(notes, splitPoint),
          prevSplitPoint: -1
        };

        if (pos > 0) {
          let bestPrevSplitPoint = -1;
          let minPenalty = Number.MAX_SAFE_INTEGER;
          const prevNotes = Array.from(chords.values())[pos - 1].notes;

          for (let prevSplitPoint = 0; prevSplitPoint <= prevNotes.length; ++prevSplitPoint) {
            const prevPenalty = splits[pos - 1].possibleSplits[prevSplitPoint].penalty
              + this.findSimilarityPenalty(notes, prevNotes, splitPoint, prevSplitPoint)
              + this.findIntersectionPenalty(onTime, pos - 1, prevSplitPoint, maxChordLen, splits, splitPoint > 0, splitPoint < notes.length);

            if (prevPenalty < minPenalty) {
              minPenalty = prevPenalty;
              bestPrevSplitPoint = prevSplitPoint;
            }
          }

          if (bestPrevSplitPoint === -1) {
            throw new Error("Best previous split point was not found");
          }

          splitTry.penalty += minPenalty;
          splitTry.prevSplitPoint = bestPrevSplitPoint;
        }

        split.possibleSplits.push(splitTry);
      }

      splits.push(split);
      ++pos;
    }
    return splits;
  }


  findLastSplitPoint(splits: ChordSplitData[]): number {
    let splitPoint = -1;
    let minPenalty = Number.MAX_SAFE_INTEGER;
    const possibleSplits = splits[splits.length - 1].possibleSplits;

    for (let i = 0; i < possibleSplits.length; ++i) {
      if (possibleSplits[i].penalty < minPenalty) {
        minPenalty = possibleSplits[i].penalty;
        splitPoint = i;
      }
    }

    if (splitPoint === -1) {
      throw new Error("Last split point was not found");
    }
    return splitPoint;
  }






  areNotesSortedByPitchInAscOrder(notes: MidiNote[]) {
    for (let i = 1; i < notes.length; ++i) {
      if (notes[i - 1].pitch > notes[i].pitch) {
        return false;
      }
    }
    return true;
  }



  findPitchWidthPenalty(notes: MidiNote[], splitPoint: number): number {
    const octave = 12;
    const maxPitchWidth = octave + 2;
    let penalty = 0;

    if (splitPoint > 0) {
      const lowPitchWidth = Math.abs(notes[0].pitch - notes[splitPoint - 1].pitch);
      if (lowPitchWidth <= octave) {
        penalty += 0;
      } else if (lowPitchWidth <= maxPitchWidth) {
        penalty += 20;
      } else {
        penalty += 100;
      }
    }

    if (splitPoint < notes.length) {
      const highPitchWidth = Math.abs(notes[splitPoint].pitch - notes[notes.length - 1].pitch);
      if (highPitchWidth <= octave) {
        penalty += 0;
      } else if (highPitchWidth <= maxPitchWidth) {
        penalty += 20;
      } else {
        penalty += 100;
      }
    }
    return penalty;
  }


  findSimilarityPenalty(
    notes: MidiNote[],
    prevNotes: MidiNote[],
    splitPoint: number,
    prevSplitPoint: number
  ): number {
    let penalty = 0;
    // check for octaves and accompaniment
    if (splitPoint > 0 && prevSplitPoint > 0) {
      const isLowOctave = this.isOctave(notes, 0, splitPoint);
      const isPrevLowOctave = this.isOctave(prevNotes, 0, prevSplitPoint);

      if (isLowOctave && isPrevLowOctave) {               // octaves
        penalty -= 12;
      } else if (splitPoint > 1 && prevSplitPoint > 1) {  // accompaniment
        penalty -= 5;
      }
    }
    if (splitPoint < notes.length && prevSplitPoint < prevNotes.length) {
      const isHighOctave = this.isOctave(notes, splitPoint, notes.length);
      const isPrevHighOctave = this.isOctave(prevNotes, prevSplitPoint, prevNotes.length);

      if (isHighOctave && isPrevHighOctave) {
        penalty -= 12;
      } else if (notes.length - splitPoint > 1 && prevNotes.length - prevSplitPoint > 1) {
        penalty -= 5;
      }
    }
    // check for one-note melody
    if (splitPoint - 0 === 1 && prevSplitPoint - 0 === 1) {
      penalty -= 12;
    }
    if (notes.length - splitPoint === 1 && prevNotes.length - prevSplitPoint === 1) {
      penalty -= 12;
    }
    return penalty;
  }


  areOffTimesEqual(notes: MidiNote[], start: number, end: number): boolean {
    const offTime = notes[start].offTime;
    let areEqual=true;
    for (let i = start + 1; i < end; i++) {      
        if (notes[i].offTime.numerator === offTime.numerator ||
        notes[i].offTime.denominator === offTime.denominator ) {
        areEqual = false;
        break;
      }

    }
    return areEqual;
  }

  findDurationPenalty(notes: MidiNote[], splitPoint: number): number {
    let penalty = 0;
    if (splitPoint > 0 && this.areOffTimesEqual(notes, 0, splitPoint)) {
      penalty -= 10;
    }
    if (splitPoint < notes.length && this.areOffTimesEqual(notes, splitPoint, notes.length)) {
      penalty -= 10;
    }
    return penalty;
  }

  findNoteCountPenalty(notes: MidiNote[], splitPoint: number): number {
    let penalty = 0;
    const leftHandNoteCount = splitPoint;
    const rightHandNoteCount = notes.length - splitPoint;

    if (leftHandNoteCount > rightHandNoteCount) {
      penalty += (leftHandNoteCount - rightHandNoteCount) * 10;
    } else {
      penalty += (rightHandNoteCount - leftHandNoteCount) * 10;
    }
    return penalty;
  }



  findIntersectionPenalty(
    currentOnTime: ReducedFraction,
    prevPos: number,
    prevSplitPoint: number,
    maxChordLen: ReducedFraction,
    splits: ChordSplitData[],
    hasLowNotes: boolean,
    hasHighNotes: boolean
  ): number {
    let penalty = 0;
    let pos = prevPos;
    let splitPoint = prevSplitPoint;

    while (addFractions(splits[pos].chord[0], maxChordLen) > currentOnTime) {
      const chord = splits[pos].chord[1];

      if (hasLowNotes) {
        let maxNoteOffTime: ReducedFraction = { ticks: 0, numerator: 0, denominator: 1 };
        for (let i = 0; i !== splitPoint; ++i) {
          if (compareFractions(chord.notes[i].offTime, maxNoteOffTime) > 0) {
            maxNoteOffTime = chord.notes[i].offTime;
          }
        }
        if (compareFractions(maxNoteOffTime, currentOnTime) > 0) {
          penalty += 10;
        }
      }
      if (hasHighNotes) {
        let maxNoteOffTime: ReducedFraction = { ticks: 0, numerator: 0, denominator: 1 };
        for (let i = splitPoint; i !== chord.notes.length; ++i) {
          if (compareFractions(chord.notes[i].offTime, maxNoteOffTime) > 0) {
            maxNoteOffTime = chord.notes[i].offTime;
          }
        }
        if (compareFractions(maxNoteOffTime, currentOnTime) > 0) {
          penalty += 10;
        }
      }
      if (pos === 0) {
        break;
      }
      const splitTry = splits[pos].possibleSplits[splitPoint];
      splitPoint = splitTry.prevSplitPoint;
      --pos;
    }
    return penalty;
  }











  maxNoteOffTime(notes: MidiNote[]): ReducedFraction {
    return notes.reduce((max, note) => compareFractions(note.offTime, max) > 0 ? note.offTime : max, { ticks: 0, numerator: 0, denominator: 1 });
  }

  isOctave(notes: MidiNote[], beg: number, end: number): boolean {
    const octave = 12;
    return end - beg === 2 && notes[end - 1].pitch - notes[beg].pitch === octave;
  }
}



