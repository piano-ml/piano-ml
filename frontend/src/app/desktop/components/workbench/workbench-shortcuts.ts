import type { Hands, HandsMode } from '../../service/player-control.service';

/** What a workbench keyboard shortcut does. */
export type WorkbenchShortcut =
  | { action: 'hands'; hands: Hands; mode: HandsMode }
  | { action: 'playPause' }
  | { action: 'tempo'; delta: number }
  | { action: 'back' }
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
    return { action: 'hands', ...hands };
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
