import { Injectable } from '@angular/core';
import type { Note } from '@tonejs/midi/dist/Note';
import PianoKeys from '@jesperdj/pianokeys';
import { midiToPitch } from './midi-maths';

/** How long a wrong key stays red on the on-screen keyboard. */
export const WRONG_KEY_FLASH_MS = 400;

/**
 * Service responsible for managing the visual keyboard (DOM manipulation and highlighting)
 */
@Injectable({
  providedIn: 'root'
})
export class PlayerKeyboardService {

  pianoKeys: PianoKeys.Keyboard | null = null;
  keyPressed = new Set<string>();

 COLOR_RIGHT = [
  '#fffaa6', // plus jaune dès le début
  '#fff77a',
  '#fff44f',
  '#fff224',
  '#ffe600',
  '#ffd700',
  '#ffc800',
  '#ffb800',
  '#ffa800',
  '#ff9800'  // jaune-orangé pour finir le dégradé
];
  COLOR_LEFT = [
    '#90c7ff', // bleu de départ
    '#7bb8f6',
    '#66a9ed',
    '#519ae4',
    '#3c8bdb',
    '#277cd2',
    '#126dc9',
    '#005fc0',
    '#0051a8',
    '#004390'  // bleu plus profond
  ];
  COLOR_WRONG = '#FF0000';

  /** Colour of each lit key (undefined: the keyboard's default fill), so a wrong-key flash can restore it. */
  private readonly keyColors = new Map<string, string | undefined>();
  /** Keys flashing red, with the timer that ends the flash. */
  private readonly wrongKeyTimers = new Map<string, ReturnType<typeof setTimeout>>();

  /**
   * Set the proper PianoKeys instance to be used by the service for DOM manipulation. A keyboard shown again
   * (e.g. after a wrong note while it was hidden) is a new instance: the keys lit meanwhile are lit on it.
   * @param pianoKeys 
   */
  setPianoKeys(pianoKeys: PianoKeys.Keyboard): void {
    this.pianoKeys = pianoKeys;
    for (const [name, color] of this.keyColors) {
      this.fill(name, color);
    }
    for (const name of this.wrongKeyTimers.keys()) {
      this.pianoKeys.fillKey(name, this.COLOR_WRONG);
    }
  }

  /**
   * Fills the key of `midi` in red for WRONG_KEY_FLASH_MS, then gives it back the colour it has then (lit) or
   * clears it. A repeated wrong press restarts the flash.
   */
  flashWrongKey(midi: number): void {
    const name = midiToPitch(midi);
    const running = this.wrongKeyTimers.get(name);
    if (running) {
      clearTimeout(running);
    }
    this.pianoKeys?.fillKey(name, this.COLOR_WRONG);
    this.wrongKeyTimers.set(name, setTimeout(() => {
      this.wrongKeyTimers.delete(name);
      if (this.keyColors.has(name)) {
        this.fill(name, this.keyColors.get(name));
      } else {
        this.pianoKeys?.clearKey(name);
      }
    }, WRONG_KEY_FLASH_MS));
  }

  private fill(name: string, color: string | undefined): void {
    if (color === undefined) {
      this.pianoKeys?.fillKey(name);
    } else {
      this.pianoKeys?.fillKey(name, color);
    }
  }

  private lit(name: string, color: string | undefined): void {
    this.keyPressed.add(name);
    this.keyColors.set(name, color);
  }

  private unlit(name: string): void {
    this.keyPressed.delete(name);
    this.keyColors.delete(name);
  }

  /**
   * Press a specific key on the visual keyboard, filling it with the appropriate color based on velocity
   * @param name The name of the key to press (e.g., 'C4')
   * @param note The MIDI note number (e.g., 60 for C4)
   */
  press(name: string, note: number) {
    this.lit(name, undefined); // Track the note as currently pressed
    this.pianoKeys?.fillKey(name);
  }

  /**
   * Release a specific key on the visual keyboard, clearing its color
   * @param name The name of the key to release (e.g., 'C4')
   * @param note The MIDI note number (e.g., 60 for C4)
   */
  release(name: string, note: number) {
    this.unlit(name);
    this.pianoKeys?.clearKey(name);
  }

  /**
   * Light up a note on the visual keyboard with the appropriate velocity
   * @param hand The hand playing the note ('rh' for right hand, 'lh' for left hand)
   * @param note The MIDI note to light up
   */
  lightNoteOnKeyboard(hand: string, note: Note): void {
    if (note.name===undefined) { // TODO why note comes without name ?
      note.name = midiToPitch(note.midi);
    }
    const velocityUI = Math.round(Math.min(Math.max(note.velocity * 10, 1), 10));
    const color = hand === 'rh' ? this.COLOR_RIGHT[velocityUI - 1] : this.COLOR_LEFT[velocityUI - 1];
    this.lit(note.name, color); // Track the note as currently lit
    this.pianoKeys?.fillKey(note.name, color);
  }

  /**
   * Turn off a specific MIDI note on the visual keyboard
   * @param midi The MIDI note to turn off
   */
  removeMidiPitchFromKeyboard(midi: number): void {
    const noteName = midiToPitch(midi);
    this.unlit(noteName);
    this.pianoKeys?.clearKey(noteName);
  }

  /**
   * Turn off a specific MIDI note on the visual keyboard
   * @param note The MIDI note to turn off
   */
  removeMidiNoteFromKeyboard(note: Note): void {
    this.unlit(note.name);
    this.pianoKeys?.clearKey(note.name);
  }


  /**
   * Turn off all notes on the visual keyboard
   */
  removeAllNotesFromKeyboard(): void {
     this.keyPressed.forEach(noteName => {
       this.pianoKeys?.clearKey(noteName);
     });
     this.keyPressed.clear();
     this.keyColors.clear();
     for (const [noteName, timer] of this.wrongKeyTimers) {
       clearTimeout(timer);
       this.pianoKeys?.clearKey(noteName);
     }
     this.wrongKeyTimers.clear();
  }

}
