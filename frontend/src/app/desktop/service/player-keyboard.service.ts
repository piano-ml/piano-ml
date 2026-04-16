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
