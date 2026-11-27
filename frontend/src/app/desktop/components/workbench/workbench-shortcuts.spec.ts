import { TEMPO_SHORTCUT_STEP, type ShortcutKey, workbenchShortcut } from './workbench-shortcuts';

function key(init: Partial<ShortcutKey>): ShortcutKey {
  return { key: '', code: '', repeat: false, ctrlKey: false, metaKey: false, altKey: false, target: document.body, ...init };
}

describe('workbenchShortcut', () => {
  it('maps 1, 2 and 3 to waiting for the right hand, the left hand and both, by physical key', () => {
    expect(workbenchShortcut(key({ key: '1', code: 'Digit1' }))).toEqual({ action: 'hands', hands: 'right', mode: 'wait' });
    // AZERTY: the 2 key types "é" without Shift
    expect(workbenchShortcut(key({ key: 'é', code: 'Digit2' }))).toEqual({ action: 'hands', hands: 'left', mode: 'wait' });
    expect(workbenchShortcut(key({ key: '3', code: 'Numpad3' }))).toEqual({ action: 'hands', hands: 'both', mode: 'wait' });
  });

  it('maps 0 to playing along with both hands', () => {
    // AZERTY: the 0 key types "à" without Shift
    expect(workbenchShortcut(key({ key: 'à', code: 'Digit0' }))).toEqual({ action: 'hands', hands: 'both', mode: 'along' });
    expect(workbenchShortcut(key({ key: '0', code: 'Numpad0' }))).toEqual({ action: 'hands', hands: 'both', mode: 'along' });
  });

  it('maps Space, the left arrow and Esc', () => {
    expect(workbenchShortcut(key({ key: ' ', code: 'Space' }))).toEqual({ action: 'playPause' });
    expect(workbenchShortcut(key({ key: 'ArrowLeft', code: 'ArrowLeft' }))).toEqual({ action: 'back' });
    expect(workbenchShortcut(key({ key: 'Escape', code: 'Escape' }))).toEqual({ action: 'showToolbar' });
  });

  it('changes the tempo with + and −, also held down', () => {
    expect(workbenchShortcut(key({ key: '+', code: 'NumpadAdd' }))).toEqual({ action: 'tempo', delta: TEMPO_SHORTCUT_STEP });
    expect(workbenchShortcut(key({ key: '=', code: 'Equal', repeat: true }))).toEqual({ action: 'tempo', delta: TEMPO_SHORTCUT_STEP });
    expect(workbenchShortcut(key({ key: '-', code: 'Minus' }))).toEqual({ action: 'tempo', delta: -TEMPO_SHORTCUT_STEP });
  });

  it('ignores held keys, browser shortcuts, other keys and the forward arrow', () => {
    expect(workbenchShortcut(key({ key: ' ', code: 'Space', repeat: true }))).toBeNull();
    expect(workbenchShortcut(key({ key: '1', code: 'Digit1', ctrlKey: true }))).toBeNull();
    expect(workbenchShortcut(key({ key: '+', code: 'Equal', metaKey: true }))).toBeNull();
    expect(workbenchShortcut(key({ key: 'a', code: 'KeyA' }))).toBeNull();
    expect(workbenchShortcut(key({ key: 'ArrowRight', code: 'ArrowRight' }))).toBeNull();
  });

  it('leaves the keys typed in a field or on a slider handle alone', () => {
    const input = document.createElement('input');
    expect(workbenchShortcut(key({ key: '1', code: 'Digit1', target: input }))).toBeNull();
    const handle = document.createElement('div');
    handle.className = 'noUi-handle';
    expect(workbenchShortcut(key({ key: 'ArrowLeft', code: 'ArrowLeft', target: handle }))).toBeNull();
  });
});
