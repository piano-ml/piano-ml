import type { Router } from "@angular/router";
import { Chord, getChordNote, majorKeySpellings, MinorKeys, minorKeySignatureSharpFlats, minorKeySpellings, Scale } from "../desktop/service/music-theory";
import type { Exercise } from "./model";
import type { ReducedFraction } from "../desktop/model/reduced-fraction";
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
    const queryParams = { useMetronome: 'true' };
    if (scaleOrChord.kind === 'Scale') {
      const scaleKey = normalizeKey(scaleOrChord.key ?? scaleOrChord.name);
      const exerciseKey = normalizeKey(exercice.key ?? exercice.title);

      router.navigate(['/', 'workbench', 'scale', scaleKey, key, exerciseKey], {
        state: {
          fromStorage: true
        },
        queryParams
      });
      return;
    } else if (scaleOrChord.kind === 'Chord') {
      const scaleKey = normalizeKey(scaleOrChord.name);
      const exerciseKey = normalizeKey(exercice.key ?? exercice.title);
      router.navigate(['/', 'workbench', 'agility', scaleKey, key, exerciseKey], {
        state: {
          fromStorage: true
        },
        queryParams
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
  // Divisions per quarter note, fine enough for the shortest note of this exercise
  const divisions = computeDivisions(exercice);

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


function createElementNote(numberInPattern: number, finger: number, duration: number, shape: { type: string, dots: number }, scaleOrChord: Scale | Chord, octave: number, key: string, isChord: boolean): elements.Note {
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
      new elements.Type({ contents: [shape.type as any] }),
      createElementDots(shape.dots),
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
  const measures: elements.MeasurePartwise[] = [];
  let noteElements: elements.Note[] = [];
  let sumDuration = 0;
  const measureLength = measureLengthInWholeNotes(exercice.beat);

  let shortMeasures = 0;

  const flushMeasure = () => {
    if (noteElements.length === 0) return;
    if (sumDuration < measureLength - 1e-9) shortMeasures++;
    const attributes = measures.length === 0 ? attributesFirstMeasure : attributesNextMeasure;
    measures.push(new elements.MeasurePartwise({
      attributes: { number: '' + (measures.length + 1) },
      contents: [
        [attributes, ...noteElements],
      ],
    }));
    noteElements = [];
    sumDuration = 0;
  };

  // Répéter le pattern selon exercice.repeat
  for (let repeat = 0; repeat < exercice.repeat; repeat++) {
    for (let i = 0; i < notesInPattern.length; i++) {

      const noteInPattern = notesInPattern[i];
      const noteLength = durationInWholeNotes(noteInPattern.duration);

      // Close the measure before it overflows: notes are never split across a
      // barline, so a pattern that does not divide the measure evenly leaves the
      // measure short rather than running over it.
      if (sumDuration + noteLength > measureLength + 1e-9) {
        flushMeasure();
      }

      const duration = convertDurationToMusicXML(noteInPattern.duration, divisions);
      const shape = describeNoteShape(noteInPattern.duration);
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
          const note = createElementNote(noteStart, noteInPattern.finger?.[j] || 0, duration, shape, scaleOrChord, octave, key, j > 0);
          noteElements.push(note);
        }
      } else {
        const rest = createElementRest(duration, shape)
        noteElements.push(rest);
      }

      sumDuration = sumDuration + noteLength;

    }
  }

  // Add any remaining notes to a final measure
  const lastMeasureIsShort = sumDuration < measureLength - 1e-9;
  flushMeasure();

  // A final short measure is expected (the pattern simply ends); short measures
  // in the middle mean the pattern does not divide the measure evenly.
  if (shortMeasures - (lastMeasureIsShort ? 1 : 0) > 0) {
    console.warn(
      `${exercice.title} (${hand}): pattern does not fill ${exercice.beat.numerator}/${exercice.beat.denominator} measures evenly, ` +
      `${shortMeasures} measure(s) are short. Notes are not tied across barlines.`
    );
  }

  return new elements.PartPartwise({
    attributes: { id: partId },
  }).setMeasures(measures);
}

function createElementDots(dots: number): elements.Dot[] {
  return Array.from({ length: dots }, () => new elements.Dot({}));
}

function createElementRest(duration: number, shape: { type: string, dots: number }): elements.Note {
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
      new elements.Type({ contents: [shape.type as any] }),
      createElementDots(shape.dots),
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

/**
 * Durations in a pattern are divisors of a whole note: 1 = whole, 2 = half,
 * 4 = quarter, 8 = eighth... A note therefore lasts `1 / duration` whole note,
 * which is the single source of truth for the MIDI ticks, the MusicXML
 * <duration>, the engraved note shape and the measure splitting below.
 *
 * Fractional divisors express dotted values: a dotted quarter lasts 3/8 of a
 * whole note, so its divisor is 8/3.
 */
function durationInWholeNotes(duration: number): number {
  return 1 / duration;
}

const NOTE_TYPES: { type: string, wholeNotes: number }[] = [
  { type: 'whole', wholeNotes: 1 },
  { type: 'half', wholeNotes: 1 / 2 },
  { type: 'quarter', wholeNotes: 1 / 4 },
  { type: 'eighth', wholeNotes: 1 / 8 },
  { type: '16th', wholeNotes: 1 / 16 },
  { type: '32nd', wholeNotes: 1 / 32 },
  { type: '64th', wholeNotes: 1 / 64 },
];

const MAX_DOTS = 2;

/**
 * Engraved shape of a note: the base note type plus the number of dots needed to
 * reach its actual length. A dotted note of `n` dots lasts `2 - 2^-n` times its
 * base type, e.g. a dotted quarter is 1.5 quarters.
 */
function describeNoteShape(duration: number): { type: string, dots: number } {
  const wholeNotes = durationInWholeNotes(duration);
  for (const { type, wholeNotes: base } of NOTE_TYPES) {
    for (let dots = 0; dots <= MAX_DOTS; dots++) {
      const dotted = base * (2 - 2 ** -dots);
      if (Math.abs(dotted - wholeNotes) < 1e-9) {
        return { type, dots };
      }
    }
  }
  console.warn('Unsupported note duration, falling back to a quarter note:', duration);
  return { type: 'quarter', dots: 0 };
}

/**
 * MusicXML expresses <duration> in divisions per quarter note and requires whole
 * numbers, so divisions has to be fine enough for every duration in the
 * exercise: the shortest note, and dotted notes, need more than the 4 divisions
 * a plain quarter note would.
 */
function computeDivisions(exercice: Exercise): number {
  const durations = [...exercice.patternRightHand, ...exercice.patternLeftHand].map(n => n.duration);
  let divisions = 4;
  while (divisions < 512 && durations.some(d => !Number.isInteger(4 * divisions * durationInWholeNotes(d)))) {
    divisions = divisions * 2;
  }
  return divisions;
}

function convertDurationToMusicXML(duration: number, divisions: number): number {
  return Math.round(4 * divisions * durationInWholeNotes(duration));
}

/** Length of one measure, in whole notes: 4/4 is a whole note, 3/4 three quarters. */
function measureLengthInWholeNotes(beat: ReducedFraction): number {
  return beat.numerator / beat.denominator;
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
