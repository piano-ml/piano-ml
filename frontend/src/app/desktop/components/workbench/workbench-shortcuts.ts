import type { Hands, HandsMode } from '../../service/player-control.service';
import { type ShortcutKey, hasCommandModifier, isKeyboardTarget } from '../../../shared/keyboard/keyboard-shortcuts';

/** What a workbench keyboard shortcut does. */
export type WorkbenchShortcut =
  | { action: 'hands'; hands: Hands; mode: HandsMode }
  | { action: 'playPause' }
  | { action: 'tempo'; delta: number }
  | { action: 'showToolbar' };

/** Tempo change per + or − press (bpm); held down, the key repeats. */
export const TEMPO_SHORTCUT_STEP = 5;

/** Physical keys (layout-independent: "1" is Shift+& on AZERTY) mapped to the hands the student plays, and how. */
const HAND_KEYS: Record<string, { hands: Hands; mode: HandsMode }> = {
  Digit0: { hands: 'both', mode: 'along' }, Numpad0: { hands: 'both', mode: 'along' },
  Digit1: { hands: 'right', mode: 'wait' }, Numpad1: { hands: 'right', mode: 'wait' },
  Digit2: { hands: 'left', mode: 'wait' }, Numpad2: { hands: 'left', mode: 'wait' },
  Digit3: { hands: 'both', mode: 'wait' }, Numpad3: { hands: 'both', mode: 'wait' },
};

/** Characters for the tempo: what the key types, so + works whatever the layout (Shift+= on QWERTY). */
const TEMPO_KEYS: Record<string, number> = {
  '+': TEMPO_SHORTCUT_STEP, '=': TEMPO_SHORTCUT_STEP,
  '-': -TEMPO_SHORTCUT_STEP, '_': -TEMPO_SHORTCUT_STEP, '−': -TEMPO_SHORTCUT_STEP,
};

/**
 * The workbench shortcut for a key press, or null: keys typed in a field, with Ctrl/⌘/Alt (the browser's own
 * shortcuts), or held down (except the tempo) are left alone. ← and → are the app's history keys (AppComponent).
 */
export function workbenchShortcut(event: ShortcutKey): WorkbenchShortcut | null {
  if (hasCommandModifier(event) || isKeyboardTarget(event.target)) {
    return null;
  }
  const tempo = TEMPO_KEYS[event.key];
  if (tempo !== undefined) {
    return { action: 'tempo', delta: tempo };
  }
  if (event.repeat) {
    return null;
  }
  const hands = HAND_KEYS[event.code];
  if (hands) {
    return { action: 'hands', ...hands };
  }
  switch (event.key) {
    case ' ': return { action: 'playPause' };
    case 'Escape': return { action: 'showToolbar' };
    default: return null;
  }
}
