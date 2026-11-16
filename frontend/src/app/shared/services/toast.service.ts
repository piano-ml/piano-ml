import { Injectable, signal } from '@angular/core';

export interface ToastAction {
  label: string;
  run: () => void;
}

export interface Toast {
  id: number;
  message: string;
  action?: ToastAction;
  tone: 'info' | 'error';
}

export interface ToastOptions {
  action?: ToastAction;
  tone?: 'info' | 'error';
  /** Milliseconds before it goes away on its own (default 5 s) */
  duration?: number;
}

export const TOAST_DURATION_MS = 5000;

/**
 * One short message at a time at the bottom of the page, with an optional action (Undo, View...).
 * A new toast replaces the current one. The countdown pauses while the pointer or the focus is on it.
 */
@Injectable({ providedIn: 'root' })
export class ToastService {
  readonly current = signal<Toast | null>(null);

  private nextId = 1;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private remaining = 0;
  private startedAt = 0;

  show(message: string, options: ToastOptions = {}): void {
    this.clearTimer();
    this.current.set({ id: this.nextId++, message, action: options.action, tone: options.tone ?? 'info' });
    this.remaining = options.duration ?? TOAST_DURATION_MS;
    this.startTimer();
  }

  error(message: string): void {
    this.show(message, { tone: 'error' });
  }

  dismiss(): void {
    this.clearTimer();
    this.current.set(null);
  }

  /** Runs the toast's action, then closes it. */
  runAction(): void {
    const action = this.current()?.action;
    this.dismiss();
    action?.run();
  }

  pause(): void {
    if (this.timer) {
      this.clearTimer();
      this.remaining -= Date.now() - this.startedAt;
    }
  }

  resume(): void {
    if (this.current() && !this.timer) {
      this.startTimer();
    }
  }

  private startTimer(): void {
    this.startedAt = Date.now();
    this.timer = setTimeout(() => this.dismiss(), Math.max(this.remaining, 1000));
  }

  private clearTimer(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }
}
