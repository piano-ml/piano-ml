import { DOUBLE_BACK_JUMP_SCORE, MULTI_REPEAT_SCORE, VOLTA_DOUBLE_BACK_JUMP_SCORE, VOLTA_SCORE, renderScore } from '../../testing/score-fixture';
import { applyMidiRepeatConventions } from './midi-repeat-conventions';

/**
 * OSMD's playback order is adapted to MuseScore's only where they differ: a section closed by more than one
 * backward repeat. renderScore() already applies the conventions (as osmd.component.ts does).
 */
describe('applyMidiRepeatConventions', () => {
  it('leaves plain repeats, adjacent repeats and first/second endings as OSMD plays them', async () => {
    for (const score of [MULTI_REPEAT_SCORE, VOLTA_SCORE]) {
      const rendered = await renderScore(score);
      expect(rendered.osmd.Sheet.Repetitions.every((rep) => rep.UserNumberOfRepetitions <= 2)).toBe(true);
      expect(applyMidiRepeatConventions(rendered.osmd.Sheet)).toBe(0);
      rendered.dispose();
    }
  });

  it('a second :| without its own |: jumps back to the last |:', async () => {
    const rendered = await renderScore(DOUBLE_BACK_JUMP_SCORE);
    const implicit = rendered.osmd.Sheet.Repetitions.find((rep) => rep.StartIndex === 3)!;
    expect(implicit.getBackwardJumpTarget()).toBe(1); // OSMD alone: 3, just after the first :|
    rendered.dispose();
  });

  it('a repetition with two :| is played three times, the third pass with the last ending', async () => {
    const rendered = await renderScore(VOLTA_DOUBLE_BACK_JUMP_SCORE);
    const rep = rendered.osmd.Sheet.Repetitions.find((r) => r.BackwardJumpInstructions.length === 2)!;
    expect(rep.UserNumberOfRepetitions).toBe(3);
    expect([1, 2, 3].map((pass) => rep.getForwardJumpTargetForIteration(pass))).toEqual([3, 4, 4]);
    rendered.dispose();
  });

  it('is idempotent, and ignores a sheet that is not loaded', async () => {
    const rendered = await renderScore(VOLTA_DOUBLE_BACK_JUMP_SCORE);
    expect(applyMidiRepeatConventions(rendered.osmd.Sheet)).toBe(0); // renderScore() applied them already
    expect(applyMidiRepeatConventions(undefined)).toBe(0);
    rendered.dispose();
  });
});
