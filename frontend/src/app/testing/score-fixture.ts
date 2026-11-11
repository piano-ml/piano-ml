import { Midi } from '@tonejs/midi';
import { OpenSheetMusicDisplay } from 'opensheetmusicdisplay';

/**
 * Test helper: a small two-staff piano score, as MusicXML (rendered with OSMD in the test browser) and
 * as the MIDI file that plays it, built from the same description so both always agree.
 *
 * A note is "C5" or "F#3" (a chord: "C4+E4+G4"), followed by its length in quarters ("C5:2" = half note);
 * "r" is a rest. Without a length a note is a quarter.
 */
export interface FixtureMeasure {
  treble: string[];
  bass: string[];
  /** Repeat sign at the start of this measure (|:) */
  repeatStart?: boolean;
  /** Repeat sign at the end of this measure (:|): playback jumps back to the last repeatStart, once */
  repeatEnd?: boolean;
}

export const PPQ = 480;
const STEPS: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const TYPES: Record<number, string> = { 4: 'whole', 3: 'half', 2: 'half', 1: 'quarter' };

interface ParsedNote {
  pitches: { step: string; alter: number; octave: number; midi: number }[];
  quarters: number;
}

function parse(token: string): ParsedNote {
  const [pitchPart, length] = token.split(':');
  const quarters = length ? Number(length) : 1;
  if (pitchPart === 'r') return { pitches: [], quarters };
  const pitches = pitchPart.split('+').map((p) => {
    const match = /^([A-G])(#|b)?(-?\d)$/.exec(p);
    if (!match) throw new Error(`bad note ${p}`);
    const [, step, accidental, octave] = match;
    const alter = accidental === '#' ? 1 : accidental === 'b' ? -1 : 0;
    return { step, alter, octave: Number(octave), midi: (Number(octave) + 1) * 12 + STEPS[step] + alter };
  });
  return { pitches, quarters };
}

function noteXml(token: string, voice: number, staff: number): string {
  const { pitches, quarters } = parse(token);
  const type = `<type>${TYPES[quarters]}</type>${quarters === 3 ? '<dot/>' : ''}`;
  if (pitches.length === 0) {
    return `<note><rest/><duration>${quarters}</duration><voice>${voice}</voice>${type}<staff>${staff}</staff></note>`;
  }
  return pitches
    .map((p, i) =>
      `<note>${i > 0 ? '<chord/>' : ''}<pitch><step>${p.step}</step>${p.alter ? `<alter>${p.alter}</alter>` : ''}` +
      `<octave>${p.octave}</octave></pitch><duration>${quarters}</duration><voice>${voice}</voice>${type}<staff>${staff}</staff></note>`)
    .join('');
}

/** MusicXML for the measures (4/4, C major, treble + bass staves). */
export function scoreXml(measures: FixtureMeasure[]): string {
  const body = measures.map((m, i) => {
    const attributes = i === 0
      ? '<attributes><divisions>1</divisions><key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time>' +
        '<staves>2</staves><clef number="1"><sign>G</sign><line>2</line></clef><clef number="2"><sign>F</sign><line>4</line></clef></attributes>'
      : '';
    const start = m.repeatStart ? '<barline location="left"><bar-style>heavy-light</bar-style><repeat direction="forward"/></barline>' : '';
    const end = m.repeatEnd ? '<barline location="right"><bar-style>light-heavy</bar-style><repeat direction="backward"/></barline>' : '';
    return `<measure number="${i + 1}">${attributes}${start}` +
      m.treble.map((t) => noteXml(t, 1, 1)).join('') +
      '<backup><duration>4</duration></backup>' +
      m.bass.map((t) => noteXml(t, 5, 2)).join('') +
      `${end}</measure>`;
  }).join('');
  return '<?xml version="1.0" encoding="UTF-8"?><score-partwise version="3.1">' +
    '<part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>' +
    `<part id="P1">${body}</part></score-partwise>`;
}

/** Measure indexes in playback order (a :| jumps back to the last |: once). */
export function playbackOrder(measures: FixtureMeasure[]): number[] {
  const order: number[] = [];
  let repeatFrom = 0;
  const repeated = new Set<number>();
  for (let i = 0; i < measures.length; i++) {
    if (measures[i].repeatStart) repeatFrom = i;
    order.push(i);
    if (measures[i].repeatEnd && !repeated.has(i)) {
      repeated.add(i);
      i = repeatFrom - 1;
    }
  }
  return order;
}

/**
 * The MIDI file playing the measures in playback order: track 0 = right hand, track 1 = left hand.
 * `alter(measureIndex, hand, pitch)` can change a played pitch (to simulate a MIDI that differs from the score).
 */
export function scoreMidi(
  measures: FixtureMeasure[],
  alter: (measure: number, hand: 'treble' | 'bass', midi: number) => number = (_m, _h, midi) => midi,
): Midi {
  const midi = new Midi();
  midi.header.setTempo(120);
  const tracks = { treble: midi.addTrack(), bass: midi.addTrack() };
  playbackOrder(measures).forEach((measureIndex, bar) => {
    for (const hand of ['treble', 'bass'] as const) {
      let beat = 0;
      for (const token of measures[measureIndex][hand]) {
        const { pitches, quarters } = parse(token);
        for (const p of pitches) {
          tracks[hand].addNote({
            midi: alter(measureIndex, hand, p.midi),
            ticks: (bar * 4 + beat) * PPQ,
            durationTicks: quarters * PPQ,
            velocity: 0.8,
          });
        }
        beat += quarters;
      }
    }
  });
  return midi;
}

/** Renders the score with OSMD into a fresh element of the test page. Call `dispose()` when done. */
export async function renderScore(measures: FixtureMeasure[]): Promise<{ osmd: OpenSheetMusicDisplay; host: HTMLElement; dispose: () => void }> {
  const host = document.createElement('div');
  host.style.width = '1200px';
  document.body.appendChild(host);
  const osmd = new OpenSheetMusicDisplay(host, { backend: 'svg', autoResize: false, drawTitle: false, followCursor: false });
  await osmd.load(scoreXml(measures));
  osmd.render();
  return { osmd, host, dispose: () => { osmd.clear(); host.remove(); } };
}

/** Three plain bars: a scale in the right hand over whole notes in the left. */
export const SIMPLE_SCORE: FixtureMeasure[] = [
  { treble: ['C5', 'D5', 'E5', 'F5'], bass: ['C3:4'] },
  { treble: ['G5', 'A5', 'B5', 'C6'], bass: ['G2:4'] },
  { treble: ['C5+E5+G5:2', 'r:2'], bass: ['C3:4'] },
];

/** Same with a repeat: bars 1-2 are played twice (1 2 1 2 3). */
export const REPEAT_SCORE: FixtureMeasure[] = [
  { treble: ['C5', 'D5', 'E5', 'F5'], bass: ['C3:4'], repeatStart: true },
  { treble: ['G5', 'A5', 'B5', 'C6'], bass: ['G2:4'], repeatEnd: true },
  { treble: ['C5+E5+G5:2', 'r:2'], bass: ['C3:4'] },
];
