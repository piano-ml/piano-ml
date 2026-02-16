import { Injectable, signal } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import type { PlayConfiguration, lateNote } from '../model/model';
import type { OpenSheetMusicDisplay, Cursor } from 'opensheetmusicdisplay';

/**
 * Service central qui contient tout l'état partagé entre les différents services du player.
 * Ce service agit comme une source unique de vérité pour l'état du lecteur.
 */
@Injectable({
  providedIn: 'root'
})
export class PlayerStateService {
  // OSMD state
  osmd: OpenSheetMusicDisplay | null = null;
  //osmdCursor: Cursor = null as unknown as Cursor;

  // Signals for reactive state
  readonly measure = signal<number>(0);
  readonly message = signal<string>("");
  readonly elapsedTime = new BehaviorSubject<number>(0);

  // Playback state
  duration = 0;
  isWaiting = false;
  playConfiguration!: PlayConfiguration;
  currentMeasure = -1;
  lastMidiEventTime = 0; // TODO: duplicate of currentTick?

  // MIDI tracking
  //midiPressedNotes: Set<number> = new Set<number>();
  //lateNotes: Map<number, lateNote[]> = new Map<number, lateNote[]>();
  ticks: number = 0;

  // Keyboard preferences
  leftmostKey: number = 21;  // Default A0
  rightmostKey: number = 108; // Default C8

  // Cached time factor to avoid repeated calculations
  private _timeFactorCache?: number;
  private _lastTempoFactor?: number;
  private _lastDelayFactor?: number;
  tick: any;


  constructor() {}

  /**
   * Calcule le facteur de temps en utilisant le cache
   */
  getTimeFactor(): number {
    // Check if cache is invalid
    if (this._timeFactorCache === undefined
      || this._lastTempoFactor !== this.playConfiguration.tempoFactor
      || this._lastDelayFactor !== this.playConfiguration.delayFactor) {
      // Recalculate and cache
      this._timeFactorCache = 1 / (this.playConfiguration.tempoFactor / this.playConfiguration.delayFactor);
      this._lastTempoFactor = this.playConfiguration.tempoFactor;
      this._lastDelayFactor = this.playConfiguration.delayFactor;
    }
    return this._timeFactorCache;
  }

  /**
   * Invalide le cache du facteur de temps
   */
  invalidateTimeFactorCache(): void {
    this._timeFactorCache = undefined;
    this._lastTempoFactor = undefined;
    this._lastDelayFactor = undefined;
  }


  /**
   * Réinitialise l'état de base
   */
  reset(): void {
    this.lastMidiEventTime = -1;
  }
}
