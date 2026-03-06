import type { Router } from "@angular/router";
import { Chord, getChordNote, majorKeySpellings, MinorKeys, minorKeySignatureSharpFlats, minorKeySpellings, Scale } from "../desktop/service/music-theory";
import type { Exercise } from "./model";
import * as Midi from '@tonejs/midi';
import { Header } from '@tonejs/midi';
//import { getNote } from "../shared/services/midi-service.service";
import { getNoteDuration, getNoteDurationTicks } from "../desktop/service/midi-maths";
import { MusicXML, elements } from '@stringsync/musicxml';
import { EXERCICE_INFO_KEY, MIDI_STORAGE_KEY, MUSIC_XML_STORAGE_KEY } from "../desktop/model/model";
import { majorKeySignatureSharpFlats, MajorKeys } from "../desktop/service/music-theory";

const keyToNote: { [key: string]: number } = {}

export function getWeekOfYear(): number {
  const date = new Date();
  const start = new Date(date.getFullYear(), 0, 1);
  const diff = (date.getTime() - start.getTime()) + ((start.getTimezoneOffset() - date.getTimezoneOffset()) * 60 * 1000);
  const oneWeek = 1000 * 60 * 60 * 24 * 7;
  return Math.floor(diff / oneWeek);
}


export function loadExercice(router: Router, exercice: Exercise, scaleOrChord: Scale | Chord, key: string) {
  const midi = saveExerciseToStorage(exercice, scaleOrChord, key);
  if (midi) {
    if (scaleOrChord.kind === 'Scale') {
      const scaleKey = normalizeKey(scaleOrChord.key ?? scaleOrChord.name);
      const exerciseKey = normalizeKey(exercice.key ?? exercice.title);

      router.navigate(['/', 'workbench', 'scale', scaleKey, key, exerciseKey], {
        state: {
          fromStorage: true
        }
      });
      return;
    } else if (scaleOrChord.kind === 'Chord') {
      const scaleKey = normalizeKey(scaleOrChord.name);
      const exerciseKey = normalizeKey(exercice.key ?? exercice.title);
      router.navigate(['/', 'workbench', 'agility', scaleKey, key, exerciseKey], {
        state: {
          fromStorage: true
        }
      });
      return;
    }
  }
}

export function saveExerciseToStorage(exercice: Exercise, scaleOrChord: Scale | Chord, key: string): Midi.MidiJSON | null {
  const mxml = generateExerciseAsMusicXML(exercice, scaleOrChord, key);
  localStorage.setItem(MUSIC_XML_STORAGE_KEY, mxml);

  const midi = generateExerciceAsMidi(exercice, scaleOrChord, key);
  if (!midi) {
    return null;
  }

  localStorage.setItem(MIDI_STORAGE_KEY, JSON.stringify(midi));

  const exerciceInfo = {
    title: exercice.title,
    tonic: key,
    mode: scaleOrChord.name,
    kind: scaleOrChord.kind,
  }
  localStorage.setItem(EXERCICE_INFO_KEY, JSON.stringify(exerciceInfo));

  return midi;
}

function normalizeKey(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_{2,}/g, '_');
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

  // Répéter le pattern selon exercice.repeat
  for (let repeat = 0; repeat < exercice.repeat; repeat++) {
    for (let i = 0; i < notesInPattern.length; i++) {
      const noteInPattern = notesInPattern[i];
      const duractionTicks = getNoteDurationTicks(noteInPattern.duration, beat, header.ppq)
      const duractionMs = getNoteDuration(noteInPattern.duration, beat, tempo)
      if (noteInPattern.note[0] !== 0) {
        for (let j = 0; j < noteInPattern.note.length; j++) {
          let midiNoteNum: number;
          if (scaleOrChord.kind === "Scale") {
            midiNoteNum = getScaleNotes(scaleOrChord, octave, key, noteInPattern.note[j]);
          } else {
            midiNoteNum = getChordNote(getNote(`${key}${octave}`), noteInPattern.note[j], scaleOrChord.pattern)
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

  }
  return track;
}


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
  return midi.toJSON();
}

export function generateExerciseAsMusicXML(exercice: Exercise, scaleOrChord: Scale | Chord, key: string): string {
  const title = `${key} ${scaleOrChord.name}: ${exercice.title}`;

  // Call fingeringFn if it exists
  if (exercice.fingeringFn) {
    exercice.fingeringFn(key, exercice);
  }

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


function createElementNote(numberInPattern: number, finger: number, duration: number, scaleOrChord: Scale | Chord, octave: number, key: string, isChord: boolean): elements.Note {
  let midiNoteNum: number;
  if (scaleOrChord.kind === "Scale") {
    midiNoteNum = getScaleNotes(scaleOrChord, octave, key, numberInPattern);
  } else {
    midiNoteNum = getChordNote(getNote(`${key}${octave}`), numberInPattern, scaleOrChord.pattern);
  }

  const pitchInfo = midiNoteToPitch(midiNoteNum, key);
  //const duration = convertDurationToMusicXML(noteInPattern.duration, divisions);

  // Create notations with fingering if available
  const notations: elements.Notations[] = [];
  if (finger) {
    const fingering = new elements.Fingering({
      attributes: { alternate: 'no', substitution: 'no' },
      contents: [finger.toString()],
    });

    const technical = new elements.Technical({
      contents: [[fingering]],
    });

    notations.push(
      new elements.Notations({
        contents: [
          null, // elements.Footnote
          null, // elements.Level
          [technical] // Array of notation elements
        ],
      })
    );
  }

  const note = new elements.Note({
    contents: [
      [
        isChord ? new elements.Chord({}) : null, // Chord element for notes after the first one
        new elements.Pitch({
          contents: [
            new elements.Step({ contents: [pitchInfo.step as any] }),
            new elements.Alter({ contents: [pitchInfo.alter as any] }),
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
      notations,
      new Array<elements.Lyric>(),
      null, // elements.Play
      null, // elements.Listen
    ],
  });
  return note;
}

function createAttributeNextMeasure(hand: string, exercice: Exercise, divisions: number, key: string): elements.Attributes {
  const keySignature = createKeySignature(key);

  const attributesNextMeasure = new elements.Attributes({
    contents: [
      null, // elements.Footnote
      null, // elements.Level
      new elements.Divisions({ contents: [divisions] }),
      keySignature, // Add key signature
      new Array<elements.Time>(),
      null, // elements.Staves
      null, // elements.PartSymbol
      null, // elements.Instruments
      new Array<elements.Clef>(),
      new Array<elements.StaffDetails>(),
      new Array<elements.Transpose>(),
      new Array<elements.Directive>(),
      new Array<elements.MeasureStyle>(),
    ],
  });
  return attributesNextMeasure;
}

function createAttributeFirstMeasure(hand: string, exercice: Exercise, divisions: number, key: string): elements.Attributes {
  const keySignature = createKeySignature(key);

  // Create attributes for the measure
  const attributesFirstMeasure = new elements.Attributes({
    contents: [
      null, // elements.Footnote
      null, // elements.Level
      new elements.Divisions({ contents: [divisions] }),
      keySignature, // Add key signature
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
  return attributesFirstMeasure
}

function createKeySignature(key: string): Array<elements.Key> {
  if (key.includes('m')) {
    return createMinorKeySignature(key);
  }
  return createMajorKeySignature(key);
}

function createMinorKeySignature(key: string): Array<elements.Key> {
  const minorKey = key as MinorKeys;
  const sharpsFlats = minorKeySignatureSharpFlats[minorKey];
  return internalCreateKeySignature(sharpsFlats!, 'minor');
}

function internalCreateKeySignature(sharpsFlats: string[], mode: string): Array<elements.Key> {
  if (!sharpsFlats || sharpsFlats.length === 0) {
    // C major - no sharps or flats
    return new Array<elements.Key>();
  }

  // Determine if it's sharps or flats based on the first accidental
  const isFlats = sharpsFlats[0].includes('b');
  const fifths = isFlats ? -sharpsFlats.length : sharpsFlats.length;

  const keyElement = new elements.Key({
    contents: [
      [
        null, // Cancel
        new elements.Fifths({ contents: [fifths] }),
        new elements.Mode({ contents: [mode] }), // Mode
      ],
      new Array<elements.KeyOctave>()
    ],
  });
  return new Array<elements.Key>(keyElement);
}

function createMajorKeySignature(key: string): Array<elements.Key> {
  const majorKey = key as MajorKeys;
  const sharpsFlats = majorKeySignatureSharpFlats[majorKey];
  return internalCreateKeySignature(sharpsFlats!, 'major');
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
  const m = getNote(`${key}4`);
  const octave = (hand === 'lh' ? 3 : 4) + (exercice.octaveShift - 2 || 0) + (m < 65 ? 1 : 0);

  // Create attributes for the measure
  const attributesFirstMeasure = createAttributeFirstMeasure(hand, exercice, divisions, key);
  const attributesNextMeasure = createAttributeNextMeasure(hand, exercice, divisions, key);

  // Create measure with attributes and notes
  const measures = [];
  let noteElements: elements.Note[] = [];
  let measureCounter = 0;
  let sumDuration = 0;
  // Répéter le pattern selon exercice.repeat
  for (let repeat = 0; repeat < exercice.repeat; repeat++) {
    for (let i = 0; i < notesInPattern.length; i++) {

      // Create new measure based on noteInPattern loop, not note loop
      if (sumDuration >= 1) {
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
        sumDuration = 0;
      }

      const noteInPattern = notesInPattern[i];
      const duration = convertDurationToMusicXML(noteInPattern.duration, divisions);
      if (noteInPattern.note[0] !== 0) {
        // Generate notes as a chord if multiple notes, otherwise as a single note
        for (let j = 0; j < noteInPattern.note.length; j++) {
          let noteStart = 0;
          if (noteInPattern.progression) {
            console.log("progression", noteInPattern.progression);
            //let midiNoteNum = getScaleNotes(scaleOrChord, octave, key, noteInPattern);
            //getScale(noteInPattern.note[j], noteInPattern.progression)
            noteStart = noteInPattern.note[j];
          } else {
            noteStart = noteInPattern.note[j];
          }
          const note = createElementNote(noteStart, noteInPattern.finger?.[j] || 0, duration, scaleOrChord, octave, key, j > 0);
          noteElements.push(note);
        }
      } else {
        const rest = createElementRest(duration)
        noteElements.push(rest);
      }

      sumDuration = sumDuration + (1 / noteInPattern.duration);

    }

    // Add any remaining notes to a final measure
    if (noteElements.length > 0) {
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
    }



  }

  return new elements.PartPartwise({
    attributes: { id: partId },
  }).setMeasures(measures);
}

function createElementRest(duration: number): elements.Note {
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
  return rest
}


function midiNoteToPitch(midiNote: number, keySignature: String): { step: string, octave: number, alter?: number } {
  let octave = Math.floor(midiNote / 12);
  const noteIndex = midiNote % 12;
  const scaleKey = keySignature.includes('m') ? keySignature as MinorKeys : keySignature as MajorKeys;
  const spellings = keySignature.includes('m') ? minorKeySpellings[scaleKey as MinorKeys] : majorKeySpellings[scaleKey as MajorKeys];
  const noteName = spellings[noteIndex];
  return {
    step: noteName[0],
    octave: octave,
    alter: noteName.includes('#') ? 1 : noteName.includes('b') ? -1 : 0
  };
}

function convertDurationToMusicXML(duration: number, divisions: number): number {
  return 4 * divisions / duration;
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
  const correctedKey = key.includes('m') ? key.slice(0, -1) : key;
  const adjustedNumberInPattern = numberInPattern - 1;
  const octaveWithShift = octave + Math.floor(adjustedNumberInPattern / scale.pattern.length);
  const index = adjustedNumberInPattern % scale.pattern.length;
  const midiStart = getNote(correctedKey + octaveWithShift)
  const result = getScale(midiStart, scale.pattern)[index]
  return result;
}


function getNote(key: string): number {
  const equivalents = [
    { src: 'Eb', dst: 'D#' },
    { src: 'Ab', dst: 'G#' },
    { src: 'Db', dst: 'C#' },
    { src: 'Bb', dst: 'A#' }
  ]
  for (const equiv of equivalents) {
    if (key.startsWith(equiv.src)) {
      key = key.replace(equiv.src, equiv.dst);
      break;
    }
  }
  if (Object.keys(keyToNote).length === 0) {
    const A0 = 21 // first note
    const C8 = 108 // last note
    const number2Key = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
    for (let n = A0; n <= C8; n++) {
      const octave = ((n - 12) / 12) >> 0
      const name = number2Key[n % 12] + octave
      keyToNote[name] = n
    }
  }
  return keyToNote[key]
}
