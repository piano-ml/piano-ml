import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { vi } from 'vitest';
import {
  PlayerControlService, type WorkbenchHandle, accuracyOf, emptyState, flowOf, handsOf, waitFor,
} from './player-control.service';
import { PracticeSessionRecorder } from './practice-session-recorder.service';

function fakeHandle(overrides: Partial<WorkbenchHandle> = {}): WorkbenchHandle {
  return {
    getState: () => ({ ...emptyState('/work/x'), loaded: true }),
    isReady: () => true,
    getLoadError: () => null,
    setRange: vi.fn(), setWholeScore: vi.fn(), setTempoBpm: vi.fn(), setLoop: vi.fn(), setHands: vi.fn(),
    setMetronome: vi.fn(), setKeyboardVisible: vi.fn(), play: vi.fn(() => Promise.resolve()), stop: vi.fn(),
    ...overrides,
  };
}

describe('PlayerControlService', () => {
  let control: PlayerControlService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: '**', children: [] }]),
        { provide: PracticeSessionRecorder, useValue: { currentSessionSnapshot: () => null } },
      ],
    });
    control = TestBed.inject(PlayerControlService);
  });

  afterEach(() => vi.useRealTimers());

  it('has the "nothing loaded" state, with the current page, when no workbench is on screen', async () => {
    await TestBed.inject(Router).navigateByUrl('/library');
    expect(control.handle()).toBeNull();
    expect(control.state()).toEqual(emptyState('/library'));
    expect(control.state().loaded).toBe(false);
  });

  it('serves the registered workbench, and ignores the unregistration of a stale one', () => {
    const first = fakeHandle();
    const second = fakeHandle();
    control.register(first);
    control.register(second);
    control.unregister(first); // the old workbench is destroyed after the new one came up
    expect(control.handle()).toBe(second);
    expect(control.state().loaded).toBe(true);
    control.unregister(second);
    expect(control.handle()).toBeNull();
  });

  it('waits until a workbench is ready, has failed, or the time is up', async () => {
    vi.useFakeTimers();
    let ready = false;
    const pending = control.waitUntilReady(5000);
    control.register(fakeHandle({ isReady: () => ready }));
    await vi.advanceTimersByTimeAsync(400);
    ready = true;
    await vi.advanceTimersByTimeAsync(200);
    await expect(pending).resolves.toBe('ready');

    control.register(fakeHandle({ isReady: () => false, getLoadError: () => 'Not found' }));
    await expect(control.waitUntilReady(5000)).resolves.toBe('error');

    control.register(fakeHandle({ isReady: () => false }));
    const late = control.waitUntilReady(1000);
    await vi.advanceTimersByTimeAsync(1200);
    await expect(late).resolves.toBe('timeout');
  });

  it('reads the session in progress from the recorder', () => {
    expect(control.currentSession()).toBeNull();
  });

  it('maps hands, accuracy and flow like the recorder and the server', () => {
    expect([handsOf(true, true), handsOf(true, false), handsOf(false, true), handsOf(false, false)])
      .toEqual(['both', 'left', 'right', 'listen']);
    expect(waitFor('left')).toEqual({ left: true, right: false });
    expect(waitFor('listen')).toEqual({ left: false, right: false });
    expect(accuracyOf(20, 15, 5)).toBe(15 / 25);
    expect(accuracyOf(0, 0, 3)).toBeNull();
    expect(flowOf(10, 2)).toBe(0.8);
    expect(flowOf(0, 0)).toBeNull();
  });
});
