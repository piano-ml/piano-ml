import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { PLATFORM_ID } from '@angular/core';
import { BehaviorSubject, of, throwError } from 'rxjs';
import { vi } from 'vitest';
import { CoachService } from '../../core/api';
import { SessionStorageService } from '../../account/services/session-storage.service';
import { PlayerControlService } from '../../desktop/service/player-control.service';
import { CoachToolRegistry } from '../tools/tool-registry';
import type { ToolResult } from '../tools/tool';
import { MAX_FAILURES, PING_MS, RemoteBridgeService, WEB_SOCKET_FACTORY, socketUrl } from './remote-bridge.service';

/** A WebSocket the spec drives: open, receive frames, close with a code. */
class FakeSocket {
  static all: FakeSocket[] = [];
  readyState = 0;
  sent: Record<string, unknown>[] = [];
  closedWith: number | null = null;
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onclose: ((e: { code: number }) => void) | null = null;
  constructor(readonly url: string) { FakeSocket.all.push(this); }
  send(text: string) { this.sent.push(JSON.parse(text)); }
  close(code: number) { this.closedWith = code; this.readyState = 3; }
  open() { this.readyState = 1; this.onopen?.(); }
  receive(frame: object) { this.onmessage?.({ data: JSON.stringify(frame) }); }
  drop(code: number) { this.readyState = 3; this.onclose?.({ code }); }
  frames(type: string) { return this.sent.filter(f => f['type'] === type); }
}

const TOOLS = ['get_player_state', 'list_exercises', 'open_score', 'open_exercise', 'configure_practice', 'play', 'stop',
  'wait_for_take_end', 'get_current_session', 'navigate'];

describe('RemoteBridgeService', () => {
  let bridge: RemoteBridgeService;
  let tickets: ReturnType<typeof vi.fn>;
  let call: ReturnType<typeof vi.fn>;
  let loggedIn: BehaviorSubject<boolean>;
  let play: ReturnType<typeof vi.fn>;

  function setup(platform = 'browser') {
    FakeSocket.all = [];
    let n = 0;
    tickets = vi.fn(() => of({ ticket: `ticket-${++n}`, expiresInSeconds: 30 }));
    call = vi.fn(async (): Promise<ToolResult> => ({ ok: true, data: 'done' }));
    loggedIn = new BehaviorSubject(true);
    play = vi.fn(() => Promise.resolve());
    TestBed.configureTestingModule({
      providers: [
        { provide: PLATFORM_ID, useValue: platform },
        { provide: CoachService, useValue: { coachBridgeTicketPost: tickets } },
        { provide: CoachToolRegistry, useValue: { list: () => TOOLS.map(name => ({ name })), call } },
        { provide: PlayerControlService, useValue: { handle: () => ({ play }) } },
        { provide: SessionStorageService, useValue: { isLoggedIn: loggedIn.asObservable() } },
        { provide: WEB_SOCKET_FACTORY, useValue: (url: string) => new FakeSocket(url) as unknown as WebSocket },
      ],
    });
    bridge = TestBed.inject(RemoteBridgeService);
  }

  const socket = () => FakeSocket.all[FakeSocket.all.length - 1];
  const flush = () => vi.advanceTimersByTimeAsync(0);

  async function connected() {
    bridge.enable();
    await flush();
    socket().open();
    socket().receive({ type: 'ready' });
    return socket();
  }

  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    bridge?.disable();
    vi.useRealTimers();
  });

  it('builds the socket URL from the API base', () => {
    expect(socketUrl('https://api.pianoml.org', { protocol: 'https:', host: 'www.pianoml.org' })).toBe('wss://api.pianoml.org/coach/ws');
    expect(socketUrl('/api', { protocol: 'http:', host: 'localhost:4200' })).toBe('ws://localhost:4200/api/coach/ws');
    expect(socketUrl('/api', { protocol: 'https:', host: 'x.org' })).toBe('wss://x.org/api/coach/ws');
  });

  it('says hello with a fresh ticket and this tab id, is on at "ready", then pings', async () => {
    setup();
    bridge.enable();
    expect(bridge.state()).toBe('connecting');
    await flush();
    socket().open();
    expect(socket().sent[0]).toEqual({ type: 'hello', ticket: 'ticket-1', tabId: bridge.tabId });
    socket().receive({ type: 'ready' });
    expect(bridge.state()).toBe('on');
    await vi.advanceTimersByTimeAsync(PING_MS);
    expect(socket().frames('ping')).toHaveLength(1);
  });

  it('runs every registry tool and answers with the same id', async () => {
    setup();
    const s = await connected();
    for (const [i, tool] of TOOLS.entries()) {
      s.receive({ type: 'command', id: `c${i}`, tool, args: { a: i }, client: 'Laptop assistant' });
    }
    await flush();
    expect(call).toHaveBeenCalledTimes(TOOLS.length);
    expect(call).toHaveBeenCalledWith('open_score', { a: 2 });
    expect(s.frames('result').map(f => f['id']).sort()).toEqual(TOOLS.map((_, i) => `c${i}`).sort());
    expect(s.frames('result')[0]['result']).toEqual({ ok: true, data: 'done' });
    expect(bridge.lastClient()).toBe('Laptop assistant');
    expect(bridge.activity()).toHaveLength(TOOLS.length);
  });

  it('refuses a tool the registry does not list, without running anything', async () => {
    setup();
    const s = await connected();
    s.receive({ type: 'command', id: 'x', tool: 'delete_account', args: {}, client: 'c' });
    await flush();
    expect(call).not.toHaveBeenCalled();
    expect(s.frames('result')[0]).toEqual({ type: 'result', id: 'x', result: { ok: false, code: 'INVALID_ARGUMENT', message: "Unknown tool 'delete_account'." } });
  });

  it('runs commands one at a time, but never makes stop wait behind wait_for_take_end', async () => {
    setup();
    let finishFirst!: () => void;
    let finishWait!: () => void;
    call.mockImplementation((tool: string) => new Promise<ToolResult>(resolve => {
      if (tool === 'open_score') finishFirst = () => resolve({ ok: true, data: 1 });
      else if (tool === 'wait_for_take_end') finishWait = () => resolve({ ok: true, data: { ended: true } });
      else resolve({ ok: true, data: tool });
    }));
    const s = await connected();
    s.receive({ type: 'command', id: '1', tool: 'open_score', args: { slug: 'x' }, client: 'c' });
    s.receive({ type: 'command', id: '2', tool: 'configure_practice', args: {}, client: 'c' });
    await flush();
    expect(call).toHaveBeenCalledTimes(1);
    finishFirst();
    await flush();
    expect(call.mock.calls.map(c => c[0])).toEqual(['open_score', 'configure_practice']);

    s.receive({ type: 'command', id: '3', tool: 'wait_for_take_end', args: {}, client: 'c' });
    s.receive({ type: 'command', id: '4', tool: 'stop', args: {}, client: 'c' });
    await flush();
    expect(s.frames('result').map(f => f['id'])).toEqual(['1', '2', '4']);
    finishWait();
    await flush();
    expect(s.frames('result').map(f => f['id'])).toEqual(['1', '2', '4', '3']);
  });

  it('answers once even when the tool throws', async () => {
    setup();
    call.mockRejectedValue(new Error('boom'));
    const s = await connected();
    s.receive({ type: 'command', id: 'c', tool: 'stop', args: {}, client: 'c' });
    await flush();
    expect(s.frames('result')).toEqual([{ type: 'result', id: 'c', result: { ok: false, code: 'INTERNAL', message: 'The tool failed.' } }]);
  });

  it('reconnects with a new ticket after a renewal or a drop', async () => {
    setup();
    const first = await connected();
    first.drop(4000);
    expect(bridge.state()).toBe('connecting');
    await vi.advanceTimersByTimeAsync(1000);
    expect(tickets).toHaveBeenCalledTimes(2);
    socket().open();
    expect(socket().sent[0]['ticket']).toBe('ticket-2');
    socket().receive({ type: 'ready' });
    expect(bridge.state()).toBe('on');
  });

  it('gives up after repeated failures, with growing waits', async () => {
    setup();
    bridge.enable();
    await flush();
    for (const wait of [1000, 2000, 5000, 15000]) {
      socket().drop(1006);
      await vi.advanceTimersByTimeAsync(wait - 1);
      const before = tickets.mock.calls.length;
      await vi.advanceTimersByTimeAsync(1);
      expect(tickets.mock.calls.length).toBe(before + 1);
    }
    socket().drop(1006);
    expect(tickets).toHaveBeenCalledTimes(MAX_FAILURES);
    expect(bridge.state()).toBe('error');
  });

  it.each([4401, 4403, 4429])('does not retry after close code %i', async (code) => {
    setup();
    const s = await connected();
    s.drop(code);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(tickets).toHaveBeenCalledTimes(1);
    expect(bridge.state()).toBe('error');
  });

  it('turns off when the ticket is refused for want of a session', async () => {
    setup();
    tickets.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 401 })));
    bridge.enable();
    await flush();
    expect(bridge.state()).toBe('off');
    expect(FakeSocket.all).toHaveLength(0);
  });

  it('closes on logout and when the user turns it off', async () => {
    setup();
    const s = await connected();
    loggedIn.next(false);
    expect(s.closedWith).toBe(1000);
    expect(bridge.state()).toBe('off');
    s.drop(1000);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(tickets).toHaveBeenCalledTimes(1);
  });

  it('tells the server which tab has the focus', async () => {
    setup();
    const s = await connected();
    window.dispatchEvent(new Event('focus'));
    expect(s.frames('focus')).toHaveLength(1);
  });

  it('asks for a click when play could not start sound, and the click plays', async () => {
    setup();
    call.mockResolvedValue({ ok: false, code: 'AUDIO_LOCKED', message: 'Press Start playback.' });
    const s = await connected();
    s.receive({ type: 'command', id: 'p', tool: 'play', args: {}, client: 'c' });
    await flush();
    expect(bridge.audioLocked()).toBe(true);
    await bridge.startPlayback();
    expect(play).toHaveBeenCalledWith(false);
    expect(bridge.audioLocked()).toBe(false);
  });

  it('does nothing during server rendering', async () => {
    setup('server');
    bridge.enable();
    await flush();
    expect(tickets).not.toHaveBeenCalled();
    expect(bridge.state()).toBe('off');
  });
});
