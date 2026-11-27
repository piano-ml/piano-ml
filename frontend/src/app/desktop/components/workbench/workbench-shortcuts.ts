import type { Hands } from '../../service/player-control.service';

/** What a workbench keyboard shortcut does. */
export type WorkbenchShortcut =
  | { action: 'waitFor'; hands: Hands }
  | { action: 'playPause' }
  | { action: 'tempo'; delta: number }
  | { action: 'back' }
  | { action: 'showToolbar' };

/** Tempo change per + or − press (bpm); held down, the key repeats. */
export const TEMPO_SHORTCUT_STEP = 5;

/** Physical keys (layout-independent: "1" is Shift+& on AZERTY) mapped to the hands waited for. */
const HAND_KEYS: Record<string, Hands> = {
  Digit1: 'right', Numpad1: 'right',
  Digit2: 'left', Numpad2: 'left',
  Digit3: 'both', Numpad3: 'both',
};

/** Characters for the tempo: what the key types, so + works whatever the layout (Shift+= on QWERTY). */
const TEMPO_KEYS: Record<string, number> = {
  '+': TEMPO_SHORTCUT_STEP, '=': TEMPO_SHORTCUT_STEP,
  '-': -TEMPO_SHORTCUT_STEP, '_': -TEMPO_SHORTCUT_STEP, '−': -TEMPO_SHORTCUT_STEP,
};

/** The subset of KeyboardEvent the mapping reads. */
export type ShortcutKey = Pick<KeyboardEvent, 'key' | 'code' | 'repeat' | 'ctrlKey' | 'metaKey' | 'altKey' | 'target'>;

/**
 * The workbench shortcut for a key press, or null: keys typed in a field, with Ctrl/⌘/Alt (the browser's own
 * shortcuts), or held down (except the tempo) are left alone.
 */
export function workbenchShortcut(event: ShortcutKey): WorkbenchShortcut | null {
  if (event.ctrlKey || event.metaKey || event.altKey || isEditable(event.target)) {
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
    return { action: 'waitFor', hands };
  }
  switch (event.key) {
    case ' ': return { action: 'playPause' };
    case 'ArrowLeft': return { action: 'back' };
    case 'Escape': return { action: 'showToolbar' };
    default: return null;
  }
}

/** A text field, a select, an editable element, or a slider handle (the arrows move it). */
function isEditable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  return target.isContentEditable
    || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)
    || target.closest('.noUi-handle, [role="slider"]') !== null;
}
