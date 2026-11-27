/** The subset of KeyboardEvent the shortcuts read. */
export type ShortcutKey = Pick<KeyboardEvent, 'key' | 'code' | 'repeat' | 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey' | 'target'>;

/** Widgets whose arrow keys move inside them (a slider, a list, tabs...), not through the history. */
const ARROW_WIDGETS = '.noUi-handle, [role="slider"], [role="listbox"], [role="menu"], [role="menubar"], [role="tablist"], [role="radiogroup"], [role="grid"], [role="tree"]';

/** Where keys belong to the element: a text field, a select, an editable element, or an arrow-key widget. */
export function isKeyboardTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  return target.isContentEditable
    || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)
    || target.closest(ARROW_WIDGETS) !== null;
}

/** Whether a dialog is open: every dialog of the app is a .modal or an aria-modal element, rendered only while open. */
export function isDialogOpen(): boolean {
  return document.querySelector('.modal, [aria-modal="true"]') !== null;
}

/** Ctrl, ⌘ or Alt: the browser's or the system's own shortcuts (Alt+← is already "back"). */
export function hasCommandModifier(event: ShortcutKey): boolean {
  return event.ctrlKey || event.metaKey || event.altKey;
}

/**
 * The history step for an arrow key, anywhere in the app: ← back (-1), → forward (1), else null. Left alone:
 * held keys, modified keys, and keys typed in a field or an arrow-key widget.
 */
export function historyStep(event: ShortcutKey): -1 | 1 | null {
  if (event.repeat || event.shiftKey || hasCommandModifier(event) || isKeyboardTarget(event.target)) {
    return null;
  }
  if (event.key === 'ArrowLeft') {
    return -1;
  }
  return event.key === 'ArrowRight' ? 1 : null;
}
