import { type Stave, StaveNote } from 'vexflow';
import type { StaveAndStaveNotesPair } from '../model/model';
import { type ReducedFraction } from '../model/reduced-fraction';
import type { Note } from '@tonejs/midi/dist/Note';
import { detectDuration2, getStaveDurationTick } from './midi-maths';


export function fillWithRest(stave: Stave, staveNotes: StaveNote[], chordsInStave: Array<Note[]>, timeSignature: ReducedFraction, ppq: number) {
  const start = (stave.getMeasure() ) * getStaveDurationTick(timeSignature, ppq);
  // insert rest when no notes
  if (staveNotes.length === 0) {
    staveNotes.push(new StaveNote({ keys: ['D/5'], duration: `1r`, dots: 0, alignCenter: true }));
    chordsInStave.push([]);
    return;
  }
  // TODO adapt when implementing ties....
  // insert rest between notes
  let previousEnd = start //+ chordsInStave[0][0].durationTicks;
  let staveNoteIndex = 0;
  for (let i = 0; i < chordsInStave.length; i++) {
    if (chordsInStave[i].length === 0) continue;





    const nextStart = chordsInStave[i].sort((a, b) => a.ticks - b.ticks)[0].ticks
    const endingNoteInChord = chordsInStave[i].sort((b, a) => (a.ticks + a.duration) - (b.ticks + b.duration))[0]
    const nextEnd = endingNoteInChord.ticks + endingNoteInChord.durationTicks

    const restDuration = detectDuration2(nextStart - previousEnd, timeSignature, ppq)
    // insert rest when duration < 1/32 only to limit errors dues to lack of quantisation
    if (nextStart - previousEnd >0 &&   +restDuration.duration < 32) {
      const staveRest = new StaveNote({ keys: ['c/5'], duration: `${restDuration.duration}r`, dots: restDuration.dots });
      staveNotes.splice(i  , 0, staveRest);
      chordsInStave.splice(i, 0, []);
    }
    //====
    previousEnd = nextEnd;
    staveNoteIndex = staveNoteIndex + chordsInStave[i].length;
  }
}


export function fillRests(staveAndStaveNotesPair: StaveAndStaveNotesPair[], timeSignature: ReducedFraction, ppq: number) {
  for (const v of staveAndStaveNotesPair) {
    fillWithRest(v.staveTreble, v.staveNotesTreble, v.midiNotesTreble, timeSignature, ppq)
    fillWithRest(v.staveBass, v.staveNotesBass, v.midiNotesBass, timeSignature, ppq)
  }
}
