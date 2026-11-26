import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { BeatState } from '../../service/player-state.service';

/** Gap between two beats of the ring, in hundredths of the circle. */
const SEGMENT_GAP = 3;

interface Segment {
  /** 0-based beat. */
  index: number;
  /** Rotation of the segment's start, in degrees (12 o'clock is the first beat). */
  rotate: number;
  /** Length, in hundredths of the circle (pathLength 100). */
  length: number;
  state: 'past' | 'current' | 'future';
}

/**
 * The bar as a ring, one segment per beat: the beats played are filled, the current one fills over its duration, and
 * the beat number pulses in the middle, stronger on the downbeat. Driven by BeatState, which is set on the audio
 * clock: the animations restart at each beat and never run ahead of the clicks.
 */
@Component({
  selector: 'app-beat-indicator',
  standalone: true,
  templateUrl: './beat-indicator.component.html',
  styleUrl: './beat-indicator.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BeatIndicatorComponent {
  readonly beat = input.required<BeatState>();
  /** False while wait mode waits for the student: the current beat stops filling. */
  readonly running = input(true);
  /** Quarter notes per minute, as the workbench shows the tempo. */
  readonly bpm = input<number>();
  /** `large`: over the score during the count-in; `compact`: in the toolbar while playing. */
  readonly size = input<'large' | 'compact'>('large');

  protected readonly segments = computed<Segment[]>(() => {
    const { beat, beatsPerBar } = this.beat();
    const share = 100 / beatsPerBar;
    const gap = beatsPerBar > 1 ? SEGMENT_GAP : 0;
    return Array.from({ length: beatsPerBar }, (_, index) => ({
      index,
      rotate: -90 + (index * 360) / beatsPerBar + (gap * 3.6) / 2,
      length: share - gap,
      state: index + 1 < beat ? 'past' : index + 1 === beat ? 'current' : 'future',
    }));
  });

  protected readonly downbeat = computed(() => this.beat().beat === 1);

  protected readonly phaseLabel = computed(() => {
    if (!this.running()) {
      return $localize`:@@beat.waiting:Waiting`;
    }
    return this.beat().phase === 'count-in'
      ? $localize`:@@beat.countIn:Count-in`
      : $localize`:@@beat.playing:Playing`;
  });

  protected readonly ariaLabel = computed(() => {
    const { beat, beatsPerBar } = this.beat();
    return `${this.phaseLabel()}: ${$localize`:@@beat.ofBar:Beat ${beat}:beat: of ${beatsPerBar}:beats:`}`;
  });
}
