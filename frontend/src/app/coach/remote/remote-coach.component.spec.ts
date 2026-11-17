import { ComponentFixture, TestBed } from '@angular/core/testing';
import { PLATFORM_ID, signal } from '@angular/core';
import { Router, provideRouter } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { vi } from 'vitest';
import { SessionStorageService } from '../../account/services/session-storage.service';
import type { BridgeActivity, BridgeState, RemoteBridgeService } from './remote-bridge.service';
import { REMOTE_BRIDGE_LOADER, RemoteCoachComponent } from './remote-coach.component';

describe('RemoteCoachComponent', () => {
  let fixture: ComponentFixture<RemoteCoachComponent>;
  let loggedIn: BehaviorSubject<boolean>;
  let bridge: {
    state: ReturnType<typeof signal<BridgeState>>; lastClient: ReturnType<typeof signal<string | null>>;
    activity: ReturnType<typeof signal<BridgeActivity[]>>; audioLocked: ReturnType<typeof signal<boolean>>;
    enable: ReturnType<typeof vi.fn>; disable: ReturnType<typeof vi.fn>; startPlayback: ReturnType<typeof vi.fn>;
  };

  async function create(options: { loggedIn?: boolean; platform?: string; url?: string } = {}) {
    loggedIn = new BehaviorSubject(options.loggedIn ?? true);
    bridge = {
      state: signal<BridgeState>('off'), lastClient: signal<string | null>(null), activity: signal<BridgeActivity[]>([]),
      audioLocked: signal(false),
      enable: vi.fn(() => bridge.state.set('on')), disable: vi.fn(() => bridge.state.set('off')), startPlayback: vi.fn(),
    };
    TestBed.configureTestingModule({
      imports: [RemoteCoachComponent],
      providers: [
        provideRouter([{ path: '**', children: [] }]),
        { provide: PLATFORM_ID, useValue: options.platform ?? 'browser' },
        { provide: SessionStorageService, useValue: { isLoggedIn: loggedIn.asObservable(), getUserId: () => (loggedIn.value ? 'u1' : null) } },
        { provide: REMOTE_BRIDGE_LOADER, useValue: () => Promise.resolve(bridge as unknown as RemoteBridgeService) },
      ],
    });
    fixture = TestBed.createComponent(RemoteCoachComponent);
    fixture.detectChanges();
    if (options.url) {
      await TestBed.inject(Router).navigateByUrl(options.url);
      await fixture.whenStable();
      fixture.detectChanges();
    }
  }

  /** Confirms, then waits for the bridge, which is loaded by dynamic import. */
  async function turnOn() {
    await click('remote-coach-switch');
    await click('remote-coach-confirm-yes');
    await vi.waitFor(() => expect(bridge.enable).toHaveBeenCalled());
    fixture.detectChanges();
  }

  const el = () => fixture.nativeElement as HTMLElement;
  const q = (id: string) => el().querySelector<HTMLElement>(`[data-testid="${id}"]`);
  async function click(id: string) {
    q(id)!.click();
    await fixture.whenStable();
    await new Promise(r => setTimeout(r));
    fixture.detectChanges();
  }

  it('shows nothing to a logged-out visitor, nor during server rendering', async () => {
    await create({ loggedIn: false });
    expect(q('remote-coach')).toBeNull();
    TestBed.resetTestingModule();
    await create({ platform: 'server' });
    expect(q('remote-coach')).toBeNull();
  });

  it('turns on only after the confirmation, and off in one click', async () => {
    await create();
    expect(q('remote-coach-status')?.textContent).toContain('Remote coach');
    await click('remote-coach-switch');
    expect(q('remote-coach-confirm')?.textContent).toContain('until you turn this off or close the tab');
    expect(bridge.enable).not.toHaveBeenCalled();

    await click('remote-coach-confirm-yes');
    await vi.waitFor(() => expect(bridge.enable).toHaveBeenCalledOnce());
    fixture.detectChanges();
    expect(q('remote-coach-confirm')).toBeNull();

    await click('remote-coach-switch');
    expect(bridge.disable).toHaveBeenCalledOnce();
    // Once confirmed in this page, turning it on again does not ask again
    await click('remote-coach-switch');
    await vi.waitFor(() => expect(bridge.enable).toHaveBeenCalledTimes(2));
    expect(q('remote-coach-confirm')).toBeNull();
  });

  it('dismissing the confirmation enables nothing', async () => {
    await create();
    await click('remote-coach-switch');
    await click('remote-coach-dismiss');
    expect(bridge.enable).not.toHaveBeenCalled();
    expect(q('remote-coach-confirm')).toBeNull();
  });

  it('shows who controls the tab and what it did', async () => {
    await create();
    await turnOn();
    bridge.lastClient.set('Laptop assistant');
    bridge.activity.set([{ at: new Date(), client: 'Laptop assistant', tool: 'open_score', ok: true }]);
    fixture.detectChanges();
    expect(q('remote-coach-status')?.textContent).toContain('Controlled by Laptop assistant');
    await click('remote-coach-expand');
    expect(q('remote-coach-activity')?.textContent).toContain('Opened a score');
  });

  it('offers the Start playback click when sound is locked', async () => {
    await create();
    await turnOn();
    bridge.audioLocked.set(true);
    fixture.detectChanges();
    await click('remote-coach-start-playback');
    expect(bridge.startPlayback).toHaveBeenCalledOnce();
  });

  it('?remoteCoach=1 opens the confirmation and leaves the URL, without enabling anything', async () => {
    await create({ url: '/work/prelude?remoteCoach=1&x=2' });
    await fixture.whenStable();
    expect(q('remote-coach-confirm')).not.toBeNull();
    expect(bridge.enable).not.toHaveBeenCalled();
    expect(TestBed.inject(Router).url).toBe('/work/prelude?x=2');
  });

  it('?remoteCoach=1 sends a logged-out visitor to login first, keeping the link', async () => {
    await create({ loggedIn: false, url: '/?remoteCoach=1' });
    await fixture.whenStable();
    const url = TestBed.inject(Router).url;
    expect(url).toMatch(/^\/account\/login\?returnUrl=/);
    expect(decodeURIComponent(url)).toContain('remoteCoach=1');
  });
});
