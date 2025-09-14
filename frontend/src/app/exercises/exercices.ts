import type { Router } from "@angular/router";
import { Chord, getChordNote, Scale } from "../desktop/service/music-theory";
import type { Exercise } from "./model";
import * as Midi from '@tonejs/midi';
import { Header } from '@tonejs/midi';
import { getNote } from "../shared/services/midi-service.service";
import { getNoteDuration, getNoteDurationTicks } from "../desktop/service/midi-maths";
import { MusicXML, elements } from '@stringsync/musicxml';
import { MIDI_STORAGE_KEY, MUSIC_XML_STORAGE_KEY } from "../desktop/model/model";


export function getWeekOfYear(): number {
  const date = new Date();
  const start = new Date(date.getFullYear(), 0, 1);
  const diff = (date.getTime() - start.getTime()) + ((start.getTimezoneOffset() - date.getTimezoneOffset()) * 60 * 1000);
  const oneWeek = 1000 * 60 * 60 * 24 * 7;
  return Math.floor(diff / oneWeek);
}


export function loadExercice(router: Router, exercice: Exercise, scaleOrChord: Scale | Chord, key: string) {

  const mxml = generateExerciseAsMusicXML(exercice, scaleOrChord, key);
  localStorage.setItem(MUSIC_XML_STORAGE_KEY, mxml);

  const midi = generateExerciceAsMidi(exercice, scaleOrChord, key);
  localStorage.setItem(MIDI_STORAGE_KEY, JSON.stringify(midi));

  if (midi) {
    router.navigate(['/desktop/workbench'], {
      state: {
        fromStorage: true
      }
    });
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

// function loadMidi(midi: Midi.MidiJSON) {
//   localStorage.setItem(MIDI_STORAGE_KEY, JSON.stringify(midi));
//   localStorage.setItem("studies", JSON.stringify([0, 1]));
//   localStorage.setItem("splitVoices", JSON.stringify(false));
// }

function generateMidiHeader(excercice: Exercise, name: string): Midi.Header {
  const header = new Header();
  header.setTempo(excercice.tempo);
  header.timeSignatures.push({ ticks: 0, timeSignature: [excercice.beat.numerator, excercice.beat.denominator] });
  header.name = name;
  return header;
}

function generateExerciceAsMidi(exercice: Exercise, scaleOrChord: Scale | Chord, key: string): Midi.MidiJSON {
  const name = `${key} ${scaleOrChord.name}: ${exercice.title}`;
  const header = generateMidiHeader(exercice, name);
  const tracks = generateMidiTracks(exercice, key, header, scaleOrChord)
  const midi = new Midi.Midi();
  midi.fromJSON({ header: header, tracks: tracks })
  console.log(midi);
  return midi.toJSON();
}

function generateExerciseAsMusicXML(exercice: Exercise, scaleOrChord: Scale | Chord, key: string): string {
  const title = `${key} ${scaleOrChord.name}: ${exercice.title}`;

  // Create MusicXML using @stringsync/musicxml API
  const musicXML = createMusicXMLWithAPI(exercice, scaleOrChord, key, title);

  return musicXML.serialize();
}

function createMusicXMLWithAPI(exercice: Exercise, scaleOrChord: Scale | Chord, key: string, title: string): MusicXML {
  const divisions = 4; // Quarter note = 4 divisions

  const musicXml = MusicXML.createPartwise();

  // Set work title if provided
  if (title) {
    musicXml.getRoot().setWork(
      new elements.Work({
        contents: [
          null, // elements.WorkNumber
          new elements.WorkTitle({ contents: [title] }),
          null, // elements.Opus
        ]
      })
    );
  }

  // Set part list with both hands
  musicXml
    .getRoot()
    .setPartList(
      new elements.PartList({
        contents: [
          new Array<elements.PartGroup>(),
          new elements.ScorePart({
            attributes: { id: 'P1' },
            contents: [
              null, // elements.Identification
              new Array<elements.PartLink>(),
              new elements.PartName({ contents: ['Right Hand'] }),
              null, // elements.PartNameDisplay
              null, // elements.PartAbbreviation
              null, // elements.PartAbbreviationDisplay
              new Array<elements.Group>(),
              new Array<elements.ScoreInstrument>(),
              new Array<elements.Player>(),
              new Array<elements.MidiDevice | elements.MidiInstrument>(),
            ],
          }),
          [new elements.ScorePart({
            attributes: { id: 'P2' },
            contents: [
              null, // elements.Identification
              new Array<elements.PartLink>(),
              new elements.PartName({ contents: ['Left Hand'] }),
              null, // elements.PartNameDisplay
              null, // elements.PartAbbreviation
              null, // elements.PartAbbreviationDisplay
              new Array<elements.Group>(),
              new Array<elements.ScoreInstrument>(),
              new Array<elements.Player>(),
              new Array<elements.MidiDevice | elements.MidiInstrument>(),
            ],
          })],
        ],
      })
    );

  // Create parts for both hands
  const rightHandPart = createPartWithAPI('P1', 'rh', exercice, scaleOrChord, key, divisions);
  const leftHandPart = createPartWithAPI('P2', 'lh', exercice, scaleOrChord, key, divisions);

  musicXml.getRoot().setParts([rightHandPart, leftHandPart]);

  return musicXml;
}

function createPartWithAPI(
  partId: string,
  hand: string,
  exercice: Exercise,
  scaleOrChord: Scale | Chord,
  key: string,
  divisions: number
): elements.PartPartwise {
  const notesInPattern = hand === 'lh' ? exercice.patternLeftHand : exercice.patternRightHand;
  const octave = (hand === 'lh' ? 3 : 4) + (exercice.octaveShift || 0);

  // Create attributes for the measure
  const attributesFirstMeasure = new elements.Attributes({
    contents: [
      null, // elements.Footnote
      null, // elements.Level
      new elements.Divisions({ contents: [divisions] }),
      new Array<elements.Key>(), // No key signature - default to C major
      new Array<elements.Time>(
        new elements.Time({
          contents: [
            [
              [
                [
                  new elements.Beats({ contents: [exercice.beat.numerator.toString()] }),
                  new elements.BeatType({ contents: [exercice.beat.denominator.toString()] }),
                ],
              ],
              null,
            ],
          ],
        })
      ),
      null, // elements.Staves
      null, // elements.PartSymbol
      null, // elements.Instruments
      new Array<elements.Clef>(
        new elements.Clef({
          contents: [
            new elements.Sign({ contents: [hand === 'rh' ? 'G' : 'F'] }),
            new elements.Line({ contents: [hand === 'rh' ? 2 : 4] }),
            null, // elements.ClefOctaveChange
          ]
        })
      ),
      new Array<elements.StaffDetails>(),
      new Array<elements.Transpose>(),
      new Array<elements.Directive>(),
      new Array<elements.MeasureStyle>(),
    ],
  });


  // Create attributes for the measure
  const attributesNextMeasure = new elements.Attributes({
    contents: [
      null, // elements.Footnote
      null, // elements.Level
      new elements.Divisions({ contents: [divisions] }),
      new Array<elements.Key>(), // No key signature - default to C major
      new Array<elements.Time>(),
      null, // elements.Staves
      null, // elements.PartSymbol
      null, // elements.Instruments
      new Array<elements.Clef>(
        // new elements.Clef({
        //   contents: [
        //     new elements.Sign({ contents: [hand === 'rh' ? 'G' : 'F'] }),
        //     new elements.Line({ contents: [hand === 'rh' ? 2 : 4] }),
        //     null, // elements.ClefOctaveChange
        //   ]
        // }),
      ),
      new Array<elements.StaffDetails>(),
      new Array<elements.Transpose>(),
      new Array<elements.Directive>(),
      new Array<elements.MeasureStyle>(),
    ],
  });
  


  // Generate notes for the pattern

  //let counter = 0;

  // Create measure with attributes and notes

  const measures = [];
  let noteElements: elements.Note[] = [];
  let measureCounter = 0;
  for (let i = 0; i < notesInPattern.length; i++) {
    const noteInPattern = notesInPattern[i];


    if (noteInPattern.note[0] !== 0) {
      // Generate notes
      for (let j = 0; j < noteInPattern.note.length; j++) {
        let midiNoteNum: number;
        if (scaleOrChord.kind === "Scale") {
          midiNoteNum = getScaleNotes(scaleOrChord, octave, key, noteInPattern.note[j]);
        } else {
          midiNoteNum = getChordNote(getNote(`${key}${octave}`), noteInPattern.note[j], scaleOrChord.pattern);
        }

        const pitchInfo = midiNoteToPitch(midiNoteNum);
        const duration = convertDurationToMusicXML(noteInPattern.duration, divisions);

        const note = new elements.Note({
          contents: [
            [
              null, // elements.TiedNote
              new elements.Pitch({
                contents: [
                  new elements.Step({ contents: [pitchInfo.step as any] }),
                  pitchInfo.alter !== 0 ? new elements.Alter({ contents: [pitchInfo.alter] }) : null,
                  new elements.Octave({ contents: [pitchInfo.octave] }),
                ],
              }),
              new elements.Duration({ contents: [duration] }),
              [], // elements.Tie
            ],
            new Array<elements.Instrument>(),
            null, // elements.Footnote
            null, // elements.Level
            null, // elements.Voice
            null, // elements.Type
            new Array<elements.Dot>(),
            null, // elements.Accidental
            null, // elements.TimeModification
            null, // elements.Stem
            null, // elements.Notehead
            null, // elements.NoteheadText
            null, // elements.Staff
            [], // elements.Beam
            new Array<elements.Notations>(),
            new Array<elements.Lyric>(),
            null, // elements.Play
            null, // elements.Listen
          ],
        });
        noteElements.push(note);
      }
    } else {
      // Generate rest
      const duration = convertDurationToMusicXML(noteInPattern.duration, divisions);

      const rest = new elements.Note({
        contents: [
          [
            null, // elements.TiedNote
            new elements.Rest({}),
            new elements.Duration({ contents: [duration] }),
            [], // elements.Tie
          ],
          new Array<elements.Instrument>(),
          null, // elements.Footnote
          null, // elements.Level
          null, // elements.Voice
          null, // elements.Type
          new Array<elements.Dot>(),
          null, // elements.Accidental
          null, // elements.TimeModification
          null, // elements.Stem
          null, // elements.Notehead
          null, // elements.NoteheadText
          null, // elements.Staff
          [], // elements.Beam
          new Array<elements.Notations>(),
          new Array<elements.Lyric>(),
          null, // elements.Play
          null, // elements.Listen
        ],
      });
      noteElements.push(rest);
    }

    if (i>0 && ((( (i+1) / noteInPattern.duration) % 1 === 0) || (i == notesInPattern.length -1))) {
      let attributes;
      if (measureCounter == 0) {
        attributes = attributesFirstMeasure
      } else {
        attributes = attributesNextMeasure
      }
      const newMeasure: elements.MeasurePartwise = new elements.MeasurePartwise({
        attributes: { number: '' + (measures.length + 1) },
        contents: [
          [attributes, ...noteElements],
        ],
      })
      measures.push(newMeasure);
      noteElements = [];
      measureCounter = measureCounter + 1;
    }

//    counter = counter + 1 / noteInPattern.duration;
  }
  return new elements.PartPartwise({
    attributes: { id: partId },
  }).setMeasures(measures);
}

function midiNoteToPitch(midiNote: number): { step: string, octave: number, alter: number } {
  const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const octave = Math.floor(midiNote / 12) - 1;
  const noteIndex = midiNote % 12;
  const noteName = noteNames[noteIndex];

  if (noteName.includes('#')) {
    return {
      step: noteName[0],
      octave: octave,
      alter: 1
    };
  } else {
    return {
      step: noteName,
      octave: octave,
      alter: 0
    };
  }
}

function convertDurationToMusicXML(duration: number, divisions: number): number {
  // Convert duration to MusicXML divisions
  // Assuming duration is in quarter notes (1 = quarter note)
  return Math.round(duration / divisions);
}



function getScale(midiStart: number, scalePattern: number[]): number[] {
  const notes = []
  let previous = 0;
  notes.push(midiStart);
  for (let i = 0; i < scalePattern.length; i++) {
    const next = midiStart + previous + scalePattern[i];
    const note = next;
    notes.push(note);
    previous = previous + scalePattern[i];
  }
  return notes;
}

function getScaleNotes(scale: Scale, octave: number, key: string, numberInPattern: number): number {
  const adjustedNumberInPattern = numberInPattern - 1;
  const octaveWithShift = octave + Math.floor(adjustedNumberInPattern / scale.pattern.length);
  const index = adjustedNumberInPattern % scale.pattern.length;
  const midiStart = getNote(key + octaveWithShift)
  const result = getScale(midiStart, scale.pattern)[index]
  return result
}