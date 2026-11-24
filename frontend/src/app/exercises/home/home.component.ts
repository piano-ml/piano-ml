import { Component, ChangeDetectionStrategy } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { RouterLink } from '@angular/router';
import { KeyNamePipe, ModeNamePipe, NoteNamePipe } from '../../shared/i18n';

/** How a link names its scale: the tonic alone (C), the whole key (C major), or the mode alone (minor). */
type Label = 'note' | 'key' | 'mode';

interface ScaleLink {
  route: string;
  /** The key as the keyName pipe takes it: "C major", "F# minor". */
  key: string;
  tonic: string;
  mode: string;
  label: Label;
}

interface CycleLine {
  day?: number;
  links: ScaleLink[];
}

interface CycleGroup {
  title?: string;
  day?: number;
  lines: CycleLine[];
}

/** A pair of keys practiced together: "C major", "A minor"... */
type Pair = [string, string];

function scaleLink(key: string, exercise: string, label: Label): ScaleLink {
  const [tonic, mode] = key.split(' ');
  const routeKey = mode === 'minor' ? `${tonic}m` : tonic;
  return { route: `/exercises/scale/${routeKey}/${mode}/${exercise}`, key, tonic, mode, label };
}

/** The lines of a cycle: each pair of keys, played with `exercise`, its links named by `labels`. */
function lines(pairs: Pair[], exercise: string, labels: [Label, Label]): CycleLine[] {
  return pairs.map((pair) => ({ links: pair.map((key, i) => scaleLink(key, exercise, labels[i])) }));
}

/** A major key and the minor key of the same tonic (or its enharmonic, as the scales are named). */
const parallel = (major: string, minor = major): Pair => [`${major} major`, `${minor} minor`];

/** Level 1: two keys a day, both major or both minor; the days are numbered across the groups. */
function level1(): CycleGroup[] {
  const groups: { title: string; pairs: Pair[] }[] = [
    { title: $localize`:@@exercises.majorSharp:Major Keys (Sharp):`, pairs: [['C major', 'G major'], ['D major', 'A major'], ['E major', 'B major']] },
    { title: $localize`:@@exercises.majorFlat:Major Keys (Flat):`, pairs: [['F major', 'Bb major'], ['Eb major', 'Ab major'], ['Db major', 'Gb major']] },
    { title: $localize`:@@exercises.minorSharp:Minor Keys (Sharp):`, pairs: [['A minor', 'E minor'], ['B minor', 'F# minor'], ['C# minor', 'G# minor']] },
    { title: $localize`:@@exercises.minorFlat:Minor Keys (Flat):`, pairs: [['D minor', 'G minor'], ['C minor', 'F minor'], ['Bb minor', 'D# minor']] },
  ];
  let day = 0;
  return groups.map(({ title, pairs }) => ({
    title,
    lines: lines(pairs, 'left_than_right', ['note', 'note']).map((line) => ({ ...line, day: ++day })),
  }));
}

/** One group per day. */
const byDay = (days: Pair[][], exercise: string, labels: [Label, Label]): CycleGroup[] =>
  days.map((pairs, i) => ({ day: i + 1, lines: lines(pairs, exercise, labels) }));

/** The circle of fifths, ascending from C, as major + parallel minor pairs. */
const FIFTHS: Pair[] = [
  parallel('C'), parallel('G'), parallel('D'), parallel('A'), parallel('E'), parallel('B'),
  parallel('Gb', 'F#'), parallel('Db', 'C#'), parallel('Ab', 'G#'), parallel('Eb', 'D#'), parallel('Bb'), parallel('F'),
];

@Component({
  selector: 'app-home',
  imports: [NgTemplateOutlet, RouterLink, KeyNamePipe, ModeNamePipe, NoteNamePipe],
  templateUrl: './home.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
})
export class HomeComponent {
  readonly level1 = level1();

  /** Relative major + minor keys, two pairs a day. */
  readonly level2 = byDay([
    [['C major', 'A minor'], ['G major', 'E minor']],
    [['D major', 'B minor'], ['A major', 'F# minor']],
    [['E major', 'C# minor'], ['B major', 'G# minor']],
    [['F major', 'D minor'], ['Bb major', 'G minor']],
    [['Eb major', 'C minor'], ['Ab major', 'F minor']],
    [['Db major', 'Bb minor'], ['Gb major', 'D# minor']],
  ], 'parallel_motion_in_octaves', ['key', 'key']);

  /** Parallel major + minor keys: the sharp side one day, the flat side the next. */
  readonly level3 = byDay([
    FIFTHS.slice(0, 6),
    [parallel('F'), parallel('Bb'), parallel('Eb', 'D#'), parallel('Ab', 'G#'), parallel('Db', 'C#'), parallel('Gb', 'F#')],
  ], 'parallel_motion_in_octaves', ['key', 'mode']);

  /** All the keys in one day, around the circle of fifths, ascending then descending. */
  readonly level4a: CycleGroup[] = [{ lines: lines(FIFTHS, 'contrary_motion', ['key', 'mode']) }];
  readonly level4b: CycleGroup[] = [{ lines: lines([FIFTHS[0], ...FIFTHS.slice(1).reverse()], 'contrary_motion', ['key', 'mode']) }];
}
