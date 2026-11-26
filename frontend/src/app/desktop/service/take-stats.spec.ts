import { accuracyOf, flowOf, lastTakeOf } from './take-stats';

describe('take-stats', () => {
  it('computes accuracy and flow, null when nothing was assessed', () => {
    expect(accuracyOf(20, 15, 5)).toBe(15 / 25);
    expect(accuracyOf(0, 0, 3)).toBeNull();
    expect(flowOf(20, 15, 5, 3)).toBe(12 / 25); // 1 - (3 orange + 5 red + 5 gray) / 25 notes
    expect(flowOf(0, 0, 3, 0)).toBeNull();
  });

  it('maps a recorded take with the same formulas, missing counts as zero', () => {
    expect(lastTakeOf({ startedAt: '2026-11-17T10:00:00.000Z', measureStart: 3, measureEnd: 6, completed: true,
      tempoFactor: 0.8, hands: 'right', notesExpected: 20, notesHit: 15, notesWrong: 5, onsets: 10, waits: 2 }))
      .toEqual({ startedAt: '2026-11-17T10:00:00.000Z', measureStart: 3, measureEnd: 6, completed: true, tempoFactor: 0.8,
        hands: 'right', notesExpected: 20, notesHit: 15, notesWrong: 5, onsets: 10, waits: 2, accuracy: 15 / 25, flow: 13 / 25 });
    expect(lastTakeOf({})).toEqual({ startedAt: '', measureStart: 0, measureEnd: 0, completed: false, tempoFactor: 1,
      hands: 'listen', notesExpected: 0, notesHit: 0, notesWrong: 0, onsets: 0, waits: 0, accuracy: null, flow: null });
  });
});
