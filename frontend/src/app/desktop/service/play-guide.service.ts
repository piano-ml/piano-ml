import { Injectable } from '@angular/core';

/** The hand of a score note, as the player names them. */
export type GuideHand = 'lh' | 'rh';

/**
 * Something that shows the student which notes to play: keyboard lights (an LED strip), or a MIDI output dedicated
 * to lights. It gets the notes of the hands the student plays (wait and play-along modes), never the ones the app
 * plays. Times are on the performance.now() clock, like Web MIDI's send(): an output can schedule them exactly,
 * as they come a little ahead of time (the player's lookahead).
 */
export interface PlayGuideOutput {
  noteOn(midi: number, velocity: number, hand: GuideHand, atMs: number): void;
  noteOff(midi: number, hand: GuideHand, atMs: number): void;
  /** Everything off at once: the playback stopped, paused or ended. */
  allOff(): void;
}

/**
 * The play guide: where the notes the student plays go, besides the assessment. Outputs register here; none is
 * registered by default, so nothing is sent. An output that throws never stops the playback or the others.
 */
@Injectable({ providedIn: 'root' })
export class PlayGuideService {
  private readonly outputs = new Set<PlayGuideOutput>();

  /** Adds an output; the returned function removes it. */
  register(output: PlayGuideOutput): () => void {
    this.outputs.add(output);
    return () => {
      output.allOff();
      this.outputs.delete(output);
    };
  }

  noteOn(midi: number, velocity: number, hand: GuideHand, atMs: number): void {
    this.each(output => output.noteOn(midi, velocity, hand, atMs));
  }

  noteOff(midi: number, hand: GuideHand, atMs: number): void {
    this.each(output => output.noteOff(midi, hand, atMs));
  }

  allOff(): void {
    this.each(output => output.allOff());
  }

  private each(send: (output: PlayGuideOutput) => void): void {
    for (const output of this.outputs) {
      try {
        send(output);
      } catch (e) {
        console.warn('Play guide output failed', e);
      }
    }
  }
}
