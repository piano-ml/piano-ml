import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { TOAST_DURATION_MS, ToastService } from './toast.service';

describe('ToastService', () => {
  let toast: ToastService;

  beforeEach(() => {
    vi.useFakeTimers();
    toast = TestBed.inject(ToastService);
  });
  afterEach(() => vi.useRealTimers());

  it('shows one toast at a time and dismisses it after 5 s', () => {
    toast.show('one');
    toast.show('two');
    expect(toast.current()?.message).toBe('two');
    vi.advanceTimersByTime(TOAST_DURATION_MS);
    expect(toast.current()).toBeNull();
  });

  it('pauses the countdown while hovered or focused', () => {
    toast.show('hello');
    vi.advanceTimersByTime(3000);
    toast.pause();
    vi.advanceTimersByTime(10000);
    expect(toast.current()?.message).toBe('hello');
    toast.resume();
    vi.advanceTimersByTime(2000);
    expect(toast.current()).toBeNull();
  });

  it('runs the action once and closes', () => {
    const run = vi.fn();
    toast.show('removed', { action: { label: 'Undo', run } });
    toast.runAction();
    expect(run).toHaveBeenCalledTimes(1);
    expect(toast.current()).toBeNull();
  });
});
