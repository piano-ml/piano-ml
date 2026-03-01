import { Injectable } from '@angular/core';
import type { Note } from '@tonejs/midi/dist/Note';
import PianoKeys from '@jesperdj/pianokeys';
import { midiToPitch } from './midi-maths';

/**
 * Service responsable de la gestion du clavier visuel (DOM manipulation et highlighting)
 */
@Injectable({
  providedIn: 'root'
})
export class PlayerKeyboardService {

  pianoKeys: PianoKeys.Keyboard | null = null;
  keyPressed = new Set<string>();

  COLOR_RIGHT = ['#fffee6','#fffdd1','#fffcbb','#fffaa6','#fff990','#fff77a','#fff665','#fff44f','#fff339','#fff224'];
  COLOR_LEFT = ['#bdddff','#afd5ff','#a0cfff ','#90c7ff','#75baff ','#5aadff ','#45a2ff','#3499ff','#1d8eff','#0080ff'];
  COLOR_WRONG = '#FF0000';

  setPianoKeys(pianoKeys: PianoKeys.Keyboard): void {
    this.pianoKeys = pianoKeys;
  }

  press(name: string, note: number) {
    console.log(`Pressing note ${name} (MIDI: ${note})`);
    this.keyPressed.add(name); // Track the note as currently pressed
    this.pianoKeys?.fillKey(name);
  }

  release(name: string, note: number) {
    console.log(`Releasing note ${name} (MIDI: ${note})`);
    this.keyPressed.delete(name); // Track the note as currently pressed
    this.pianoKeys?.clearKey(name);
  }

  /**
   * Allume une note sur le clavier visuel avec la vélocité appropriée
   */
  lightNoteOnKeyboard(hand: string, note: Note): void {
    // Clamp velocity to 1-10 range directly
    const velocityUI = Math.round(Math.min(Math.max(note.velocity * 10, 1), 10));
    this.keyPressed.add(note.name); // Track the note as currently pressed
    const color = hand === 'rh' ? this.COLOR_RIGHT[velocityUI - 1] : this.COLOR_LEFT[velocityUI - 1];
    this.pianoKeys?.fillKey(note.name, color);
  }

  /**
   * Éteint une note MIDI spécifique du clavier visuel
   */
  removeMidiPitchFromKeyboard(midi: number): void {
    const noteName = midiToPitch(midi);
    this.keyPressed.delete(noteName);
    this.pianoKeys?.clearKey(noteName);
  }


  removeMidiNoteFromKeyboard(note: Note): void {
    this.keyPressed.delete(note.name);
    this.pianoKeys?.clearKey(note.name);
  }


  /**
   * Éteint toutes les notes du clavier visuel
   */
  removeAllNotesFromKeyboard(): void {
     this.keyPressed.forEach(noteName => {
       this.pianoKeys?.clearKey(noteName);
     });
     this.keyPressed.clear();
  }

}
