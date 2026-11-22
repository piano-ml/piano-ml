import { handModeOf, isListening, isTimed, studentHands, withHandMode } from './hand-mode';

const none = { waitForLeftHand: false, waitForRightHand: false, alongLeftHand: false, alongRightHand: false };

describe('hand modes', () => {
  it('reads each hand: wait, along, or the app plays it', () => {
    expect(handModeOf(none, 'left')).toBe('app');
    expect(handModeOf({ ...none, waitForLeftHand: true }, 'left')).toBe('wait');
    expect(handModeOf({ ...none, alongRightHand: true }, 'right')).toBe('along');
    expect(handModeOf({ waitForLeftHand: false, waitForRightHand: false }, 'right')).toBe('app'); // older configurations
  });

  it('sets one hand without touching the other', () => {
    expect(withHandMode(none, 'right', 'along')).toEqual({ ...none, alongRightHand: true });
    expect(withHandMode({ ...none, waitForLeftHand: true }, 'right', 'wait')).toEqual({ ...none, waitForLeftHand: true, waitForRightHand: true });
    expect(withHandMode({ ...none, alongRightHand: true }, 'right', 'app')).toEqual(none);
  });

  it('never mixes wait and play-along: the other hand goes back to the app', () => {
    expect(withHandMode({ ...none, waitForLeftHand: true }, 'right', 'along')).toEqual({ ...none, alongRightHand: true });
    expect(withHandMode({ ...none, alongLeftHand: true }, 'right', 'wait')).toEqual({ ...none, waitForRightHand: true });
    expect(withHandMode({ ...none, alongLeftHand: true }, 'right', 'along')).toEqual({ ...none, alongLeftHand: true, alongRightHand: true });
  });

  it('names the hands the student plays, waited for or played along', () => {
    expect(studentHands(none)).toBe('listen');
    expect(studentHands({ ...none, alongRightHand: true })).toBe('right');
    expect(studentHands({ ...none, alongLeftHand: true, alongRightHand: true })).toBe('both');
    expect(studentHands({ ...none, waitForLeftHand: true })).toBe('left');
  });

  it('tells timed playback (no hand waits) and listening (the app plays both hands)', () => {
    expect(isTimed({ ...none, alongRightHand: true })).toBe(true);
    expect(isTimed({ ...none, waitForRightHand: true })).toBe(false);
    expect(isListening(none)).toBe(true);
    expect(isListening({ ...none, alongLeftHand: true })).toBe(false);
  });
});
