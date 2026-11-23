import { isPlatformBrowser } from '@angular/common';
import { Injectable, PLATFORM_ID, inject, signal } from '@angular/core';

export type KeyField = 'leftmostKey' | 'rightmostKey';
export type KeyRange = Record<KeyField, number>;

export const LOWEST_MIDI_KEY = 21;   // A0
export const HIGHEST_MIDI_KEY = 108; // C8

/** Where the range is stored. Other keys of this object are left untouched. */
const PREFERENCES_KEY = 'preferences';

/**
 * The keys of the user's MIDI keyboard, set in MIDI setup. Playback reads it live: a note outside the range
 * can't be played on the keyboard, so the app plays it.
 */
@Injectable({ providedIn: 'root' })
export class KeyRangeService {
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  readonly range = signal<KeyRange>({ leftmostKey: LOWEST_MIDI_KEY, rightmostKey: HIGHEST_MIDI_KEY });

  constructor() {
    this.reload();
  }

  /** Reads the stored range again (it may have been changed in another tab). */
  reload(): void {
    if (!this.isBrowser) return;
    const stored = this.readPreferences();
    this.range.set({
      leftmostKey: Number(stored['leftmostKey']) || LOWEST_MIDI_KEY,
      rightmostKey: Number(stored['rightmostKey']) || HIGHEST_MIDI_KEY,
    });
  }

  /** Applies the range at once and stores it. */
  save(range: KeyRange): void {
    this.range.set(range);
    if (!this.isBrowser) return;
    try {
      localStorage.setItem(PREFERENCES_KEY, JSON.stringify({ ...this.readPreferences(), ...range }));
    } catch {
      // Storage full or blocked: the range still applies for this visit
    }
  }

  private readPreferences(): Record<string, unknown> {
    try {
      const stored = JSON.parse(localStorage.getItem(PREFERENCES_KEY) ?? '{}');
      return stored && typeof stored === 'object' ? stored : {};
    } catch {
      return {};
    }
  }
}
