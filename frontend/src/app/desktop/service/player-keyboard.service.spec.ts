import { TestBed } from '@angular/core/testing';
import type PianoKeys from '@jesperdj/pianokeys';
import type { Note } from '@tonejs/midi/dist/Note';
import { PlayerKeyboardService } from './player-keyboard.service';

describe('PlayerKeyboardService', () => {
  let keyboard: PlayerKeyboardService;
  let keys: { fillKey: ReturnType<typeof vi.fn>; clearKey: ReturnType<typeof vi.fn> };

  const note = (overrides: Partial<Note>) => ({ midi: 60, name: 'C4', velocity: 0.5, ...overrides }) as Note;

  beforeEach(() => {
    keyboard = TestBed.inject(PlayerKeyboardService);
    keys = { fillKey: vi.fn(), clearKey: vi.fn() };
    keyboard.setPianoKeys(keys as unknown as PianoKeys.Keyboard);
  });

  it('press / release fill and clear a key and track it', () => {
    keyboard.press('C4', 60);
    expect(keys.fillKey).toHaveBeenCalledWith('C4');
    expect([...keyboard.keyPressed]).toEqual(['C4']);

    keyboard.release('C4', 60);
    expect(keys.clearKey).toHaveBeenCalledWith('C4');
    expect(keyboard.keyPressed.size).toBe(0);
  });

  describe('lightNoteOnKeyboard', () => {
    it('colors the right hand in yellow and the left hand in blue', () => {
      keyboard.lightNoteOnKeyboard('rh', note({ name: 'E4', velocity: 0.5 }));
      keyboard.lightNoteOnKeyboard('lh', note({ name: 'C3', velocity: 0.5 }));
      expect(keys.fillKey).toHaveBeenNthCalledWith(1, 'E4', keyboard.COLOR_RIGHT[4]);
      expect(keys.fillKey).toHaveBeenNthCalledWith(2, 'C3', keyboard.COLOR_LEFT[4]);
    });

    it.each([
      [0, 0], // silent note still gets the lightest color
      [0.04, 0],
      [0.26, 2],
      [1, 9],
      [1.7, 9], // clamped
    ])('velocity %s uses color #%i of the gradient', (velocity, index) => {
      keyboard.lightNoteOnKeyboard('rh', note({ velocity }));
      expect(keys.fillKey).toHaveBeenCalledWith('C4', keyboard.COLOR_RIGHT[index]);
    });

    it('names a note that comes without a name from its MIDI number', () => {
      const unnamed = note({ midi: 61, name: undefined as unknown as string });
      keyboard.lightNoteOnKeyboard('rh', unnamed);
      expect(unnamed.name).toBe('Db4');
      expect(keyboard.keyPressed.has('Db4')).toBe(true);
    });
  });

  it('removes a note by MIDI number or by note', () => {
    keyboard.press('C4', 60);
    keyboard.press('D4', 62);
    keyboard.removeMidiPitchFromKeyboard(60);
    keyboard.removeMidiNoteFromKeyboard(note({ name: 'D4' }));
    expect(keys.clearKey.mock.calls).toEqual([['C4'], ['D4']]);
    expect(keyboard.keyPressed.size).toBe(0);
  });

  it('turns every lit key off', () => {
    keyboard.press('C4', 60);
    keyboard.lightNoteOnKeyboard('lh', note({ name: 'G2' }));
    keyboard.removeAllNotesFromKeyboard();
    expect(keys.clearKey.mock.calls.map(([name]) => name).sort()).toEqual(['C4', 'G2']);
    expect(keyboard.keyPressed.size).toBe(0);
  });

  it('keeps tracking keys before the visual keyboard exists', () => {
    keyboard.pianoKeys = null;
    expect(() => {
      keyboard.press('C4', 60);
      keyboard.lightNoteOnKeyboard('rh', note({}));
      keyboard.removeAllNotesFromKeyboard();
    }).not.toThrow();
  });
});
