import { Injectable, signal } from '@angular/core';

/**
 * The sources of sound of the player, each with its own level:
 * - `score`: the notes of the score's hands the app plays (app plays and play-along hands);
 * - `accompaniment`: the other tracks of the file;
 * - `metronome`: the metronome clicks, count-in included.
 * The timing calibration's clicks go through no bus: they always sound at full volume.
 */
export type MixerBus = 'score' | 'accompaniment' | 'metronome';

export const MIXER_BUSES: readonly MixerBus[] = ['score', 'accompaniment', 'metronome'];

export type MixerLevels = Record<MixerBus, number>;

/** Every bus at its full level: the sound as the player always made it. */
export const FULL_LEVELS: MixerLevels = { score: 1, accompaniment: 1, metronome: 1 };

/**
 * The player's mixer: a level from 0 (silent) to 1 (as composed) per bus. Every note the player sounds goes
 * through velocity(), on the PianoML synth and on the MIDI outputs alike, so a level set here (by a mixer UI, to
 * come) applies to the notes scheduled from then on.
 */
@Injectable({ providedIn: 'root' })
export class AudioMixerService {
  private readonly _levels = signal<MixerLevels>({ ...FULL_LEVELS });

  readonly levels = this._levels.asReadonly();

  level(bus: MixerBus): number {
    return this._levels()[bus];
  }

  /** Sets a bus's level, clamped to 0..1. */
  setLevel(bus: MixerBus, level: number): void {
    const clamped = Number.isFinite(level) ? Math.min(1, Math.max(0, level)) : 1;
    this._levels.update(levels => ({ ...levels, [bus]: clamped }));
  }

  /** A MIDI velocity (0..127) at the bus's level; null for no bus (calibration clicks: always full). */
  velocity(bus: MixerBus | null, velocity: number): number {
    const level = bus === null ? 1 : this.level(bus);
    return Math.round(Math.min(127, Math.max(0, velocity * level)));
  }

  /** Whether a bus is silent: the player sends it nothing at all (no synth voice, no MIDI note). */
  isMuted(bus: MixerBus): boolean {
    return this.level(bus) === 0;
  }
}
