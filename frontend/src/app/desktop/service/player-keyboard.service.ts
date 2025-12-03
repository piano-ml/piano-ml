import { type ElementRef, Injectable } from '@angular/core';
import type { Note } from '@tonejs/midi/dist/Note';
import { PlayerStateService } from './player-state.service';

/**
 * Service responsable de la gestion du clavier visuel (DOM manipulation et highlighting)
 */
@Injectable({
  providedIn: 'root'
})
export class PlayerKeyboardService {
  private keyboardElement!: ElementRef;

  // DOM elements cache for keyboard keys (by MIDI note number)
  private _keyboardElementsCache = new Map<number, HTMLElement[]>();

  // Track active notes with classes to avoid expensive DOM queries
  private _activeKeyboardElements = new Set<HTMLElement>();

  constructor(private state: PlayerStateService) {
    this.loadKeyboardPreferences();
  }

  /**
   * Configure l'élément DOM du clavier
   */
  setKeyboardElement(nativeElementRef: ElementRef): void {
    this.keyboardElement = nativeElementRef;
    this._keyboardElementsCache.clear(); // Clear cache when keyboard element changes
    this._activeKeyboardElements.clear(); // Clear active elements tracking
  }

  /**
   * Récupère les éléments DOM correspondant à une note MIDI (avec cache)
   */
  private getKeyboardElements(midiNote: number): HTMLElement[] {
    if (!this._keyboardElementsCache.has(midiNote)) {
      const elements = Array.from(
        this.keyboardElement.nativeElement.querySelectorAll(`.key${midiNote}`)
      ) as HTMLElement[];
      this._keyboardElementsCache.set(midiNote, elements);
    }
    return this._keyboardElementsCache.get(midiNote)!;
  }

  /**
   * Allume une note sur le clavier visuel avec la vélocité appropriée
   */
  lightNoteOnKeyboard(hand: string, note: Note): void {
    // Clamp velocity to 1-10 range directly
    const velocityUI = Math.round(Math.min(Math.max(note.velocity * 10, 1), 10));

    const keys = this.getKeyboardElements(note.midi);

    const class1 = `note-on-${hand}`;
    const class2 = `note-on-${hand}-velocity-${velocityUI}`;

    for (const el of keys) {
      el.classList.add(class1, class2);
      this._activeKeyboardElements.add(el); // Track active element
    }
  }

  /**
   * Supprime les classes CSS d'un élément avec un préfixe donné
   */
  private clearClassesFromElement(el: HTMLElement, prefix: string): void {
    const classList = el.classList;
    // Iterate backwards to avoid issues when removing classes during iteration
    for (let i = classList.length - 1; i >= 0; i--) {
      if (classList[i].startsWith(prefix)) {
        classList.remove(classList[i]);
      }
    }
  }

  /**
   * Éteint une note MIDI spécifique du clavier visuel
   */
  removeMidiNoteFromKeyboard(midiNote: number): void {
    const keys = this.getKeyboardElements(midiNote);
    for (const key of keys) {
      this.clearClassesFromElement(key, "note-on");
      this._activeKeyboardElements.delete(key); // Remove from active set
    }
  }

  /**
   * Éteint toutes les notes du clavier visuel
   */
  removeAllNotesFromKeyboard(): void {
    for (const el of this._activeKeyboardElements) {
      this.clearClassesFromElement(el, "note-on");
    }
    this._activeKeyboardElements.clear();
  }

  /**
   * Charge les préférences du clavier depuis localStorage
   */
  private loadKeyboardPreferences(): void {
    try {
      const preferences = localStorage.getItem('preferences');
      if (preferences) {
        const parsedPreferences = JSON.parse(preferences);
        this.state.leftmostKey = parsedPreferences.leftmostKey || 21;
        this.state.rightmostKey = parsedPreferences.rightmostKey || 108;
        console.log(`Loaded keyboard preferences: leftmost=${this.state.leftmostKey}, rightmost=${this.state.rightmostKey}`);
      }
    } catch (error) {
      console.error('Error loading keyboard preferences:', error);
      // Keep default values in case of error
      this.state.leftmostKey = 21;
      this.state.rightmostKey = 108;
    }
  }

  /**
   * Recharge les préférences du clavier depuis localStorage
   * Méthode publique pour permettre le rechargement à chaud
   */
  reloadKeyboardPreferences(): void {
    this.loadKeyboardPreferences();
  }

  /**
   * Nettoie les ressources du service
   */
  cleanup(): void {
    // Clear DOM caches to prevent memory leaks
    this._keyboardElementsCache.clear();
    this._activeKeyboardElements.clear();
  }
}
