import { type Stave, StaveNote } from 'vexflow';
import type { StaveAndStaveNotesPair } from '../model/model';
import { quantiseTick, type ReducedFraction } from '../model/reduced-fraction';
import { detectDuration, getStaveDurationTick } from './music-theory';
import type { Note } from '@tonejs/midi/dist/Note';


export function fillWithRest(stave: Stave, staveNotes: StaveNote[], midiNotes: Array<Note[]>, timeSignature: ReducedFraction, ppq: number) {
  const ctx = stave.getContext();
  const start = stave.getMeasure() * getStaveDurationTick(timeSignature, ppq);
  const end = (stave.getMeasure() + 1) * getStaveDurationTick(timeSignature, ppq);

  // insert rest when no notes
  if (staveNotes.length === 0) {
    const restDuration = detectDuration(getStaveDurationTick(timeSignature, ppq), ppq)
    staveNotes.push(new StaveNote({ keys: ['c/5'], duration: `${restDuration.duration}r`, dots: restDuration.dots, alignCenter: true }));
    return;
  }
  // insert rest between notes
  let previousEnd = start + midiNotes[0][0].durationTicks;
  let staveNoteIndex = 0;
  for (let i = 0; i < midiNotes.length; i++) {
    if (midiNotes[i].length === 0) continue;
    const midiNoteStart = midiNotes[i].sort((a, b) => a.ticks - b.ticks)[midiNotes[i].length - 1].ticks
    const midiNoteDuration = midiNotes[i].sort((a, b) => a.ticks - b.ticks)[midiNotes[i].length - 1].durationTicks
    //====
    const restDuration = detectDuration(midiNoteStart - previousEnd, ppq)
    // insert rest when duration < 1/32 only to limit errors dues to lack of quantisation
    if (+restDuration.duration > 0 && +restDuration.duration < 16) {
      const staveRest = new StaveNote({ keys: ['c/5'], duration: `${restDuration.duration}r`, dots: restDuration.dots });
      staveNotes.splice(staveNoteIndex, 0, staveRest);
      midiNotes.splice(staveNoteIndex, 0, []);
    }


    //====
    previousEnd = midiNoteStart + midiNoteDuration;
    staveNoteIndex = staveNoteIndex + midiNotes[i].length;
  }
}


export function fillRests(staveAndStaveNotesPair: StaveAndStaveNotesPair[], timeSignature: ReducedFraction, ppq: number) {
  for (const v of staveAndStaveNotesPair) {
    fillWithRest(v.staveTreeble, v.staveNotesTreeble, v.midiNotesTreeble, timeSignature, ppq)
    fillWithRest(v.staveBass, v.staveNotesBass, v.midiNotesBass, timeSignature, ppq)
  }
}










