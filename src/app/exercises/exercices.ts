
import type { Router } from "@angular/router";
import { getChordNote, getNoteDuration, getNoteDurationTicks } from "../desktop/service/music-theory";
import type { Chord, Exercise, Scale } from "./model";
import * as Midi from '@tonejs/midi';
import { Header } from '@tonejs/midi';
import { getNote } from "../shared/services/midi-service.service";


export function getWeekOfYear(): number {
  const date = new Date();
  const start = new Date(date.getFullYear(), 0, 1);
  const diff = (date.getTime() - start.getTime()) + ((start.getTimezoneOffset() - date.getTimezoneOffset()) * 60 * 1000);
  const oneWeek = 1000 * 60 * 60 * 24 * 7;
  return Math.floor(diff / oneWeek);
}


export function loadExercice(router: Router, exercice: Exercise, scaleOrChord: Scale|Chord, key: string) {
  const midi = generateExcercice(exercice, scaleOrChord, key);
  if (midi) {
    loadMidi(midi);
    router.navigate(['/desktop'], { state: { 
      deckName: exercice.deckName, 
      advice: exercice.advice, 
      title: exercice.title ,
      rightHandFingering: exercice.patternRightHand.map(p => p.finger),
      leftHandFingering: exercice.patternLeftHand.map(p => p.finger),
      loop: true,
      hands: 2
    } });
  }
}

function generateMidiTracks(exercice: Exercise, key: string, header: Midi.Header, scaleOrChord: Scale | Chord): Midi.Track[] {
  return [
    generateMidiTrack('rh', exercice, scaleOrChord as Scale, key, header),
    generateMidiTrack('lh', exercice, scaleOrChord as Scale, key, header)
  ]

}

function generateMidiTrack(hand: string, exercice: Exercise, scaleOrChord: Scale | Chord, key: string, header: Midi.Header): Midi.Track {
  const track = new Midi.Track([], header)
  const tempo = exercice.tempo;
  const beat = exercice.beat
  const notesInPattern = hand === 'lh' ? exercice.patternLeftHand : exercice.patternRightHand
  const octave = (hand === 'lh' ? 3 : 4) + (exercice.octaveShift || 0);
  let time = 0;
  let ticks = 0;
  for (let i = 0; i < notesInPattern.length; i++) {
    const noteInPattern = notesInPattern[i];
    const duractionTicks = getNoteDurationTicks(noteInPattern.duration, beat, header.ppq)
    const duractionMs = getNoteDuration(noteInPattern.duration, beat, tempo)
    if (noteInPattern.note[0] !== 0) {
      for (let i = 0; i < noteInPattern.note.length; i++) {
        let midiNoteNum: number;
        if (scaleOrChord.kind === "Scale") {

          midiNoteNum = getScaleNotes(scaleOrChord, octave, key, noteInPattern.note[i]);
        } else {
          midiNoteNum = getChordNote(getNote(`${key}${octave}`), noteInPattern.note[i], scaleOrChord.pattern)
        }
        const note = {
          time: time,
          ticks: ticks,
          duration: duractionMs * 0.94,
          durationTicks: duractionTicks * 0.94,
          midi: midiNoteNum,
        }
        track.addNote(note);
      }
    }
    time = time + duractionMs;
    ticks = ticks + duractionTicks;
  }
  return track;
}

function loadMidi(midi: Midi.MidiJSON) {
  localStorage.setItem("score", JSON.stringify(midi));
  localStorage.setItem("studies", JSON.stringify([0, 1]));
  localStorage.setItem("splitVoices", JSON.stringify(false));
}

function generateMidiHeader(excercice: Exercise, name: string): Midi.Header {
  const header = new Header();
  header.setTempo(excercice.tempo);
  header.timeSignatures.push({ ticks: 0, timeSignature: [excercice.beat.numerator, excercice.beat.denominator] });
  header.name = name;
  return header;
}

function generateExcercice(exercice: Exercise, scaleOrChord: Scale | Chord, key: string): Midi.MidiJSON {
  const name = `${key} ${scaleOrChord.name}: ${exercice.title}`;
  const header = generateMidiHeader(exercice, name);
  const tracks = generateMidiTracks(exercice, key, header, scaleOrChord)
  const midi = new Midi.Midi();
  midi.fromJSON({ header: header, tracks: tracks })
  return midi.toJSON();
}


function getScale(midiStart: number, scalePattern: number[]): number[] {
  const notes = []
  let previous = 0;
  notes.push(midiStart);
  for (let i = 0; i < scalePattern.length; i++) {
    const next = midiStart + previous + scalePattern[i] ;
    const note = next;
    notes.push(note);
    previous = previous + scalePattern[i];
  }
  return notes;
}

function getScaleNotes(scale: Scale, octave: number, key: string, numberInPattern: number): number {
  const adjustedNumberInPattern = numberInPattern - 1;
  const octaveWithShift = octave + Math.floor(adjustedNumberInPattern  / scale.pattern.length);
  const index = adjustedNumberInPattern % scale.pattern.length;
  const midiStart = getNote(key + octaveWithShift)
  const result = getScale(midiStart, scale.pattern)[index]
  return result
}