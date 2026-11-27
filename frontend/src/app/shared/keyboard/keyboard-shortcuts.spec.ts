import { type ShortcutKey, historyStep } from './keyboard-shortcuts';

function key(init: Partial<ShortcutKey>): ShortcutKey {
  return { key: '', code: '', repeat: false, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, target: document.body, ...init };
}

describe('historyStep', () => {
  it('goes back with ← and forward with →', () => {
    expect(historyStep(key({ key: 'ArrowLeft' }))).toBe(-1);
    expect(historyStep(key({ key: 'ArrowRight' }))).toBe(1);
  });

  it('ignores other keys, held keys and modified keys', () => {
    expect(historyStep(key({ key: 'ArrowUp' }))).toBeNull();
    expect(historyStep(key({ key: 'ArrowLeft', repeat: true }))).toBeNull();
    expect(historyStep(key({ key: 'ArrowLeft', altKey: true }))).toBeNull();
    expect(historyStep(key({ key: 'ArrowRight', shiftKey: true }))).toBeNull();
  });

  it('leaves the arrows to fields and arrow-key widgets', () => {
    expect(historyStep(key({ key: 'ArrowLeft', target: document.createElement('input') }))).toBeNull();
    const tabs = document.createElement('div');
    tabs.setAttribute('role', 'tablist');
    const tab = document.createElement('button');
    tabs.appendChild(tab);
    expect(historyStep(key({ key: 'ArrowRight', target: tab }))).toBeNull();
  });
});
