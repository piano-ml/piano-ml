import { Injectable } from '@angular/core';
import type { Note } from '@tonejs/midi/dist/Note';
import PianoKeys from '@jesperdj/pianokeys';
import { midiToPitch } from './midi-maths';

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
    '#fffee6',
    '#fffdd1',
    '#fffcbb',
    '#fffaa6',
    '#fff990',
    '#fff77a',
    '#fff665',
    '#fff44f',
    '#fff339',
    '#fff224'
  ];
  COLOR_LEFT = [
    '#bdddff',
    '#afd5ff',
    '#a0cfff',
    '#90c7ff',
    '#75baff',
    '#5aadff',
    '#45a2ff',
    '#3499ff',
    '#1d8eff',
    '#0080ff'
  ];
  COLOR_WRONG = '#FF0000';

  /**
   * Set the proper PianoKeys instance to be used by the service for DOM manipulation
   * @param pianoKeys 
   */
  setPianoKeys(pianoKeys: PianoKeys.Keyboard): void {
    this.pianoKeys = pianoKeys;
  }

  /**
   * Press a specific key on the visual keyboard, filling it with the appropriate color based on velocity
   * @param name The name of the key to press (e.g., 'C4')
   * @param note The MIDI note number (e.g., 60 for C4)
   */
  press(name: string, note: number) {
    this.keyPressed.add(name); // Track the note as currently pressed
    this.pianoKeys?.fillKey(name);
  }

  /**
   * Release a specific key on the visual keyboard, clearing its color
   * @param name The name of the key to release (e.g., 'C4')
   * @param note The MIDI note number (e.g., 60 for C4)
   */
  release(name: string, note: number) {
    this.keyPressed.delete(name); // Track the note as currently pressed
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
    this.keyPressed.add(note.name); // Track the note as currently pressed
    const color = hand === 'rh' ? this.COLOR_RIGHT[velocityUI - 1] : this.COLOR_LEFT[velocityUI - 1];
    this.pianoKeys?.fillKey(note.name, color);
  }

  /**
   * Turn off a specific MIDI note on the visual keyboard
   * @param midi The MIDI note to turn off
   */
  removeMidiPitchFromKeyboard(midi: number): void {
    const noteName = midiToPitch(midi);
    this.keyPressed.delete(noteName);
    this.pianoKeys?.clearKey(noteName);
  }

  /**
   * Turn off a specific MIDI note on the visual keyboard
   * @param note The MIDI note to turn off
   */
  removeMidiNoteFromKeyboard(note: Note): void {
    this.keyPressed.delete(note.name);
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
  }

}
