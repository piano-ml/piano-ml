import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { DestroyRef, Injectable, InjectionToken, PLATFORM_ID, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { firstValueFrom } from 'rxjs';
import { CoachService } from '../../core/api';
import { SessionStorageService } from '../../account/services/session-storage.service';
import { PlayerControlService } from '../../desktop/service/player-control.service';
import { environment } from '../../../environments/environment';
import { CoachToolRegistry } from '../tools/tool-registry';
import type { ToolResult } from '../tools/tool';

export type BridgeState = 'off' | 'connecting' | 'on' | 'error';

/** One command executed in this tab. */
export interface BridgeActivity {
  at: Date;
  client: string;
  tool: string;
  ok: boolean;
  code?: string;
}

/** Opens the WebSocket; a token so that specs can give a fake one. */
export const WEB_SOCKET_FACTORY = new InjectionToken<(url: string) => WebSocket>('WEB_SOCKET_FACTORY', {
  factory: () => (url: string) => new WebSocket(url),
});

export const PING_MS = 20_000;
/** Waits before reconnecting, after the 1st, 2nd... failure; the last one repeats. */
export const RETRY_DELAYS_MS = [1_000, 2_000, 5_000, 15_000];
export const MAX_FAILURES = 5;
/** Closes after which reconnecting is pointless: bad ticket, origin refused, too many sockets. */
const FINAL_CLOSE_CODES = new Set([4401, 4403, 4429]);
const ACTIVITY_SIZE = 20;
/** Runs beside the queue: it waits for the take to end, and stop must still get through meanwhile. */
const PARALLEL_TOOLS = new Set(['wait_for_take_end']);

/** The WebSocket URL: the API base (absolute in production, /api through the dev proxy) + /coach/ws. */
export function socketUrl(apiBase: string, location: { protocol: string; host: string }): string {
  if (/^https?:\/\//.test(apiBase)) {
    return apiBase.replace(/^http/, 'ws').replace(/\/+$/, '') + '/coach/ws';
  }
  const scheme = location.protocol === 'https:' ? 'wss' : 'ws';
  return `${scheme}://${location.host}${apiBase.replace(/\/+$/, '')}/coach/ws`;
}

/**
 * The browser side of the Remote coach bridge (issue #414, section 3.3 of the specification). While on, this tab
 * holds a WebSocket authenticated by a one-time ticket, runs the commands sent by the user's AI assistant through
 * CoachToolRegistry, and answers each one. Not persisted: a page load starts off.
 */
@Injectable({ providedIn: 'root' })
export class RemoteBridgeService {
  private readonly coach = inject(CoachService);
  private readonly registry = inject(CoachToolRegistry);
  private readonly control = inject(PlayerControlService);
  private readonly session = inject(SessionStorageService);
  private readonly openSocket = inject(WEB_SOCKET_FACTORY);
  private readonly document = inject(DOCUMENT);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  readonly state = signal<BridgeState>('off');
  readonly lastClient = signal<string | null>(null);
  readonly activity = signal<BridgeActivity[]>([]);
  /** The last play command could not start sound: the student must click once. */
  readonly audioLocked = signal(false);

  /** Identifies this tab to the server, for this page load. */
  readonly tabId = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : String(Math.random()).slice(2);

  private wanted = false;
  private socket: WebSocket | null = null;
  private failures = 0;
  private retryTimer?: ReturnType<typeof setTimeout>;
  private pingTimer?: ReturnType<typeof setInterval>;
  private queue: Promise<void> = Promise.resolve();

  private readonly onFocus = () => this.sendFrame({ type: 'focus' });
  private readonly onVisibility = () => {
    if (this.document.visibilityState === 'visible') {
      this.sendFrame({ type: 'focus' });
    }
  };
  private readonly onPageHide = () => this.disable();

  constructor() {
    if (!this.isBrowser) {
      return;
    }
    this.session.isLoggedIn.pipe(takeUntilDestroyed(inject(DestroyRef))).subscribe(loggedIn => {
      if (!loggedIn) {
        this.disable();
      }
    });
    window.addEventListener('focus', this.onFocus);
    window.addEventListener('pagehide', this.onPageHide);
    this.document.addEventListener('visibilitychange', this.onVisibility);
    inject(DestroyRef).onDestroy(() => {
      this.disable();
      window.removeEventListener('focus', this.onFocus);
      window.removeEventListener('pagehide', this.onPageHide);
      this.document.removeEventListener('visibilitychange', this.onVisibility);
    });
  }

  enable(): void {
    if (!this.isBrowser || this.wanted) {
      return;
    }
    this.wanted = true;
    this.failures = 0;
    void this.connect();
  }

  disable(): void {
    this.wanted = false;
    clearTimeout(this.retryTimer);
    this.stopPing();
    const socket = this.socket;
    this.socket = null;
    socket?.close(1000);
    this.state.set('off');
  }

  /** The "Start playback" button: a real click, so the browser lets the page make sound. */
  async startPlayback(): Promise<void> {
    this.audioLocked.set(false);
    await this.control.handle()?.play(false);
  }

  private async connect(): Promise<void> {
    this.state.set('connecting');
    let ticket: string;
    try {
      ticket = (await firstValueFrom(this.coach.coachBridgeTicketPost())).ticket;
    } catch (e) {
      if (e instanceof HttpErrorResponse && e.status === 401) {
        this.disable(); // the session ended
      } else {
        this.retryLater();
      }
      return;
    }
    if (!this.wanted) {
      return;
    }
    const socket = this.openSocket(socketUrl(environment.api, window.location));
    this.socket = socket;
    socket.onopen = () => socket.send(JSON.stringify({ type: 'hello', ticket, tabId: this.tabId }));
    socket.onmessage = (event: MessageEvent) => this.onFrame(String(event.data));
    socket.onclose = (event: CloseEvent) => this.onClose(socket, event.code);
  }

  private onClose(socket: WebSocket, code: number): void {
    if (socket !== this.socket) {
      return; // a socket we already let go
    }
    this.socket = null;
    this.stopPing();
    if (!this.wanted) {
      return;
    }
    if (FINAL_CLOSE_CODES.has(code)) {
      this.wanted = false;
      this.state.set('error');
      return;
    }
    // 4000 (renewal) or a network drop: a new ticket, after a short wait
    this.retryLater();
  }

  private retryLater(): void {
    this.failures += 1;
    if (this.failures >= MAX_FAILURES) {
      this.wanted = false;
      this.state.set('error');
      return;
    }
    this.state.set('connecting');
    const delay = RETRY_DELAYS_MS[Math.min(this.failures, RETRY_DELAYS_MS.length) - 1];
    this.retryTimer = setTimeout(() => {
      if (this.wanted) {
        void this.connect();
      }
    }, delay);
  }

  private onFrame(text: string): void {
    let frame: { type?: string; id?: string; tool?: string; args?: unknown; client?: string };
    try {
      frame = JSON.parse(text);
    } catch {
      return;
    }
    if (frame.type === 'ready') {
      this.failures = 0;
      this.state.set('on');
      this.stopPing();
      this.pingTimer = setInterval(() => this.sendFrame({ type: 'ping' }), PING_MS);
    } else if (frame.type === 'command' && typeof frame.id === 'string') {
      this.onCommand(frame.id, String(frame.tool ?? ''), frame.args, String(frame.client ?? ''));
    }
  }

  private onCommand(id: string, tool: string, args: unknown, client: string): void {
    this.lastClient.set(client || null);
    const run = () => this.execute(id, tool, args, client);
    if (PARALLEL_TOOLS.has(tool)) {
      void run();
    } else {
      this.queue = this.queue.then(run, run);
    }
  }

  /** Runs one command and always sends exactly one result frame. */
  private async execute(id: string, tool: string, args: unknown, client: string): Promise<void> {
    let result: ToolResult;
    if (!this.registry.list().some(t => t.name === tool)) {
      result = { ok: false, code: 'INVALID_ARGUMENT', message: `Unknown tool '${tool}'.` };
    } else {
      try {
        result = await this.registry.call(tool, args);
      } catch {
        result = { ok: false, code: 'INTERNAL', message: 'The tool failed.' };
      }
    }
    if (tool === 'play') {
      this.audioLocked.set(!result.ok && result.code === 'AUDIO_LOCKED');
    }
    this.activity.update(list => [
      { at: new Date(), client, tool, ok: result.ok, ...(result.ok ? {} : { code: result.code }) },
      ...list,
    ].slice(0, ACTIVITY_SIZE));
    this.sendFrame({ type: 'result', id, result });
  }

  private sendFrame(frame: object): void {
    if (this.socket && this.socket.readyState === 1 /* OPEN */) {
      this.socket.send(JSON.stringify(frame));
    }
  }

  private stopPing(): void {
    clearInterval(this.pingTimer);
    this.pingTimer = undefined;
  }
}
