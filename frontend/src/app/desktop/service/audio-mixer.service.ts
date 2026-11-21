import { Injectable, signal } from '@angular/core';

/**
 * The sources of sound of the player, each with its own level:
 * - `score`: the notes of the score's hands the app plays (app plays and play-along hands);
 * - `accompaniment`: the other tracks of the file;
 * - `metronome`: the metronome clicks while the score plays.
 * The count-in and the timing calibration's clicks go through no bus: they always sound at full volume, so that
 * the student can catch the beat.
 */
export type MixerBus = 'score' | 'accompaniment' | 'metronome';

export const MIXER_BUSES: readonly MixerBus[] = ['score', 'accompaniment', 'metronome'];

export type MixerLevels = Record<MixerBus, number>;

/** The levels before any change: the app's notes and the metronome low under the student, the accompaniment full. */
export const DEFAULT_LEVELS: MixerLevels = { score: 0.3, accompaniment: 1, metronome: 0.3 };

/** Where the levels are kept between visits (JSON of MixerLevels). */
export const MIXER_STORAGE_KEY = 'mixerLevels';

/**
 * The player's mixer: a level from 0 (silent) to 1 (full) per bus, kept in localStorage. Every note the player
 * sounds goes through velocity(), on the PianoML synth and on the MIDI outputs alike, so a level set here applies
 * to the notes scheduled from then on.
 */
@Injectable({ providedIn: 'root' })
export class AudioMixerService {
  private readonly _levels = signal<MixerLevels>(readStoredLevels());

  readonly levels = this._levels.asReadonly();

  level(bus: MixerBus): number {
    return this._levels()[bus];
  }

  /** Sets a bus's level, clamped to 0..1 (an invalid value leaves it as it was), and keeps it for next visits. */
  setLevel(bus: MixerBus, level: number): void {
    if (!Number.isFinite(level)) return;
    const clamped = Math.min(1, Math.max(0, level));
    this._levels.update(levels => ({ ...levels, [bus]: clamped }));
    this.store();
  }

  /** Back to DEFAULT_LEVELS. */
  reset(): void {
    this._levels.set({ ...DEFAULT_LEVELS });
    this.store();
  }

  /** A MIDI velocity (0..127) at the bus's level; null for no bus (count-in, calibration: always full). */
  velocity(bus: MixerBus | null, velocity: number): number {
    const level = bus === null ? 1 : this.level(bus);
    return Math.round(Math.min(127, Math.max(0, velocity * level)));
  }

  /** Whether a bus is silent: the player sends it nothing at all (no synth voice, no MIDI note). */
  isMuted(bus: MixerBus): boolean {
    return this.level(bus) === 0;
  }

  private store(): void {
    try {
      localStorage.setItem(MIXER_STORAGE_KEY, JSON.stringify(this._levels()));
    } catch {
      // storage unavailable (server rendering, private mode): the levels last for this visit
    }
  }
}

/** The stored levels, each checked; a missing or invalid one takes its default. */
function readStoredLevels(): MixerLevels {
  const levels = { ...DEFAULT_LEVELS };
  try {
    const stored = JSON.parse(localStorage.getItem(MIXER_STORAGE_KEY) ?? 'null') as Partial<Record<string, unknown>> | null;
    for (const bus of MIXER_BUSES) {
      const value = stored?.[bus];
      if (typeof value === 'number' && value >= 0 && value <= 1) {
        levels[bus] = value;
      }
    }
  } catch {
    // no storage, or not JSON: the defaults
  }
  return levels;
}
