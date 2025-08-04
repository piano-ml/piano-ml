import { type Stave, StaveNote } from 'vexflow';
import type { StaveAndStaveNotesPair } from '../model/model';
import { quantiseTick, type ReducedFraction } from '../model/reduced-fraction';
import { detectDuration2,  getStaveDurationTick } from './music-theory';
import type { Note } from '@tonejs/midi/dist/Note';


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
  console.log("mesure  "+ stave.getMeasure()  + " start:", previousEnd);
  for (let i = 0; i < chordsInStave.length; i++) {
    if (chordsInStave[i].length === 0) continue;





    const nextStart = chordsInStave[i].sort((a, b) => a.ticks - b.ticks)[0].ticks
    const endingNoteInChord = chordsInStave[i].sort((b, a) => (a.ticks + a.duration) - (b.ticks + b.duration))[0]
    const nextEnd = endingNoteInChord.ticks + endingNoteInChord.durationTicks
    //====
    
    console.log("detail:",chordsInStave[i].map(n=> n.ticks + " + " + n.durationTicks + " = " + (n.ticks + n.durationTicks)));
    //console.log("measure:", stave.getMeasure(), " previousEnd: ", previousEnd, "nextStart: ", nextStart);
    //console.log(timeSignature, ppq);
    const restDuration = detectDuration2(nextStart - previousEnd, timeSignature, ppq)

    //const restEnd = previousEnd + ( 1 / +restDuration.duration * ppq * 4); // 1/4 = 1/32 * 8
    //console.log("???: ", restDuration.duration,  nextStart);
    // insert rest when duration < 1/32 only to limit errors dues to lack of quantisation
    if (nextStart - previousEnd >0 &&   +restDuration.duration < 32) {
      console.log("!!!rest duration: ", restDuration.duration, nextStart - previousEnd , restDuration.dots, " at ", stave.getMeasure());
      //const staveRest = new StaveNote({ keys: ['c/5'], duration: `${restDuration.duration}r`, dots: restDuration.dots });
      const staveRest = new StaveNote({ keys: ['c/5'], duration: `${restDuration.duration}r`, dots: restDuration.dots });
      staveNotes.splice(i  , 0, staveRest);
      chordsInStave.splice(i, 0, []);
    } else {
      console.log("no rest needed: ", nextStart - previousEnd, " at ", stave.getMeasure());
    }


    //====
    previousEnd = nextEnd;
    staveNoteIndex = staveNoteIndex + chordsInStave[i].length;
  }
}


export function fillRests(staveAndStaveNotesPair: StaveAndStaveNotesPair[], timeSignature: ReducedFraction, ppq: number) {
  for (const v of staveAndStaveNotesPair) {
    fillWithRest(v.staveTreble, v.staveNotesTreble, v.midiNotesTreble, timeSignature, ppq)
    //fillWithRest(v.staveBass, v.staveNotesBass, v.midiNotesBass, timeSignature, ppq)
  }
}










