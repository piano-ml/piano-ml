import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { vi } from 'vitest';
import { PlayerControlService } from '../../desktop/service/player-control.service';
import { PracticeSessionRecorder } from '../../desktop/service/practice-session-recorder.service';
import { CoachToolRegistry } from './tool-registry';
import { fakeWorkbench } from '../../testing/fake-workbench';

describe('player tools', () => {
  let registry: CoachToolRegistry;
  let control: PlayerControlService;
  let session: unknown;

  beforeEach(() => {
    session = null;
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: '**', children: [] }]),
        { provide: PracticeSessionRecorder, useValue: { currentSessionSnapshot: () => session } },
      ],
    });
    registry = TestBed.inject(CoachToolRegistry);
    control = TestBed.inject(PlayerControlService);
  });

  afterEach(() => vi.useRealTimers());

  const call = (name: string, args: Record<string, unknown> = {}) => registry.call(name, args);
  const data = async (name: string, args: Record<string, unknown> = {}) => {
    const result = await call(name, args);
    expect(result.ok, JSON.stringify(result)).toBe(true);
    return (result as { data: Record<string, unknown> }).data;
  };
  const code = async (name: string, args: Record<string, unknown> = {}) => {
    const result = await call(name, args);
    expect(result.ok).toBe(false);
    return (result as { code: string }).code;
  };

  it('get_player_state answers even with no workbench on screen', async () => {
    expect(await data('get_player_state')).toMatchObject({ loaded: false, item: null });
  });

  it('every other player tool needs a loaded score', async () => {
    for (const tool of ['configure_practice', 'play', 'stop']) {
      expect(await code(tool)).toBe('NO_SCORE_LOADED');
    }
    const loading = fakeWorkbench();
    loading.setReady(false);
    control.register(loading.handle);
    expect(await code('play')).toBe('NO_SCORE_LOADED');
  });

  describe('configure_practice', () => {
    it('changes only the given settings, tempo as a percent of the original or in bpm', async () => {
      const wb = fakeWorkbench({ tempo: { bpm: 100, originalBpm: 120, percent: 83 } });
      control.register(wb.handle);
      const state = await data('configure_practice', { fromMeasure: 3, toMeasure: 6, tempoPercent: 50, loop: true, hands: 'left', metronome: true, showKeyboard: false });
      expect(state).toMatchObject({ range: { fromMeasure: 3, toMeasure: 6 }, loop: true, hands: 'left', metronome: true, showKeyboard: false });
      expect(wb.handle.setTempoBpm).toHaveBeenCalledWith(60);
      expect(state['stoppedPlayback']).toBeUndefined();

      await data('configure_practice', { tempoBpm: 90 });
      expect(wb.handle.setTempoBpm).toHaveBeenLastCalledWith(90);
      await data('configure_practice', { toMeasure: 4 });
      expect(wb.handle.setRange).toHaveBeenLastCalledWith(3, 4);
      await data('configure_practice', { wholeScore: true });
      expect(wb.handle.setWholeScore).toHaveBeenCalled();
    });

    it('validates the range against the score and refuses the exclusive pairs', async () => {
      control.register(fakeWorkbench().handle);
      expect(await code('configure_practice', { fromMeasure: 5, toMeasure: 4 })).toBe('INVALID_RANGE');
      expect(await code('configure_practice', { toMeasure: 9 })).toBe('INVALID_RANGE');
      const result = await call('configure_practice', { fromMeasure: 9 });
      expect((result as { message: string }).message).toContain('1 to 8');
      expect(await code('configure_practice', { wholeScore: true, fromMeasure: 1 })).toBe('INVALID_ARGUMENT');
      expect(await code('configure_practice', { tempoPercent: 50, tempoBpm: 60 })).toBe('INVALID_ARGUMENT');
      expect(await code('configure_practice', { hands: 'feet' })).toBe('INVALID_ARGUMENT');
    });

    it('stops playback first when the range or the loop changes, not for the tempo', async () => {
      const wb = fakeWorkbench({ playing: true });
      control.register(wb.handle);
      expect((await data('configure_practice', { tempoPercent: 80 }))['stoppedPlayback']).toBeUndefined();
      expect(wb.handle.stop).not.toHaveBeenCalled();
      const state = await data('configure_practice', { loop: true });
      expect(state['stoppedPlayback']).toBe(true);
      expect(wb.handle.stop).toHaveBeenCalledBefore(wb.handle.setLoop as never);
    });
  });

  describe('play and stop', () => {
    it('refuses to play before the browser allows sound, without touching the player', async () => {
      const wb = fakeWorkbench({ audioUnlocked: false });
      control.register(wb.handle);
      const result = await call('play');
      expect(result).toMatchObject({ ok: false, code: 'AUDIO_LOCKED' });
      expect((result as { message: string }).message).toContain('Start playback');
      expect(wb.handle.play).not.toHaveBeenCalled();
    });

    it('resumes by default, restarts on request, and leaves a playing take alone', async () => {
      const wb = fakeWorkbench();
      control.register(wb.handle);
      expect(await data('play')).toMatchObject({ playing: true });
      expect(wb.handle.play).toHaveBeenLastCalledWith(false);
      await data('play');
      expect(wb.handle.play).toHaveBeenCalledTimes(1);
      await data('play', { restart: true });
      expect(wb.handle.play).toHaveBeenLastCalledWith(true);
    });

    it('stop waits a moment for the take to be recorded', async () => {
      vi.useFakeTimers();
      const wb = fakeWorkbench({ playing: true });
      control.register(wb.handle);
      let done = false;
      const pending = call('stop').then(r => { done = true; return r; });
      await vi.advanceTimersByTimeAsync(100);
      expect(done).toBe(false);
      await vi.advanceTimersByTimeAsync(300);
      expect(await pending).toMatchObject({ ok: true, data: { playing: false } });
    });
  });

  describe('wait_for_take_end', () => {
    it('returns at once when nothing is playing', async () => {
      control.register(fakeWorkbench().handle);
      expect(await data('wait_for_take_end')).toMatchObject({ ended: true });
    });

    it('returns when the take ends: a new lastTake, or playback stops', async () => {
      vi.useFakeTimers();
      const wb = fakeWorkbench({ playing: true });
      control.register(wb.handle);
      const loopPass = call('wait_for_take_end', { timeoutSeconds: 30 });
      await vi.advanceTimersByTimeAsync(1000);
      wb.state.lastTake = { measureStart: 1, measureEnd: 8, completed: true, tempoFactor: 1, hands: 'both', notesExpected: 10, notesHit: 9, notesWrong: 1, onsets: 5, waits: 0, accuracy: 0.9 / 1.1 * 1.1 / 1.1, flow: 1 };
      await vi.advanceTimersByTimeAsync(400);
      expect(await loopPass).toMatchObject({ ok: true, data: { ended: true, state: { playing: true } } });

      const stopped = call('wait_for_take_end', { timeoutSeconds: 30 });
      await vi.advanceTimersByTimeAsync(400);
      wb.state.playing = false;
      await vi.advanceTimersByTimeAsync(400);
      expect(await stopped).toMatchObject({ ok: true, data: { ended: true } });
    });

    it('says ended false when the time is up', async () => {
      vi.useFakeTimers();
      control.register(fakeWorkbench({ playing: true }).handle);
      const pending = call('wait_for_take_end', { timeoutSeconds: 5 });
      await vi.advanceTimersByTimeAsync(5500);
      expect(await pending).toMatchObject({ ok: true, data: { ended: false } });
    });
  });

  it('get_current_session reads the session in progress', async () => {
    expect(await data('get_current_session')).toEqual({ session: null });
    session = { takeCount: 2 };
    expect(await data('get_current_session')).toEqual({ session: { takeCount: 2 } });
  });
});
