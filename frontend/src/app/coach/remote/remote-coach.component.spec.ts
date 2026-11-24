import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Component, PLATFORM_ID, signal } from '@angular/core';
import { Router, provideRouter } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { vi } from 'vitest';
import { SessionStorageService } from '../../account/services/session-storage.service';
import { CoachGrantPresenceService } from './coach-grant-presence.service';
import type { BridgeActivity, BridgeState, RemoteBridgeService } from './remote-bridge.service';
import { RemoteCoachComponent } from './remote-coach.component';
import { REMOTE_BRIDGE_LOADER, REMOTE_COACH_DOC } from './remote-coach.service';
import { RemoteCoachToggleComponent } from './toggle/remote-coach-toggle.component';

/** The switch (as in the header) and the host (as in the app root), as the app shows them. */
@Component({
  imports: [RemoteCoachComponent, RemoteCoachToggleComponent],
  template: '<app-remote-coach-toggle /><app-remote-coach />',
})
class HostComponent {}

describe('RemoteCoachComponent', () => {
  let fixture: ComponentFixture<HostComponent>;
  let loggedIn: BehaviorSubject<boolean>;
  let bridge: {
    state: ReturnType<typeof signal<BridgeState>>; lastClient: ReturnType<typeof signal<string | null>>;
    activity: ReturnType<typeof signal<BridgeActivity[]>>; audioLocked: ReturnType<typeof signal<boolean>>;
    enable: ReturnType<typeof vi.fn>; disable: ReturnType<typeof vi.fn>; startPlayback: ReturnType<typeof vi.fn>;
  };

  let presence: { hasPlayerGrant: ReturnType<typeof signal<boolean>>; refresh: ReturnType<typeof vi.fn>; reset: ReturnType<typeof vi.fn> };

  async function create(options: { loggedIn?: boolean; platform?: string; url?: string; hasGrant?: boolean } = {}) {
    loggedIn = new BehaviorSubject(options.loggedIn ?? true);
    const hasGrant = options.hasGrant ?? true;
    presence = {
      hasPlayerGrant: signal(false),
      refresh: vi.fn(() => presence.hasPlayerGrant.set(hasGrant)),
      reset: vi.fn(() => presence.hasPlayerGrant.set(false)),
    };
    bridge = {
      state: signal<BridgeState>('off'), lastClient: signal<string | null>(null), activity: signal<BridgeActivity[]>([]),
      audioLocked: signal(false),
      enable: vi.fn(() => bridge.state.set('on')), disable: vi.fn(() => bridge.state.set('off')), startPlayback: vi.fn(),
    };
    TestBed.configureTestingModule({
      imports: [HostComponent],
      providers: [
        provideRouter([{ path: '**', children: [] }]),
        { provide: PLATFORM_ID, useValue: options.platform ?? 'browser' },
        { provide: SessionStorageService, useValue: { isLoggedIn: loggedIn.asObservable(), getUserId: () => (loggedIn.value ? 'u1' : null) } },
        { provide: CoachGrantPresenceService, useValue: presence },
        { provide: REMOTE_BRIDGE_LOADER, useValue: () => Promise.resolve(bridge as unknown as RemoteBridgeService) },
      ],
    });
    fixture = TestBed.createComponent(HostComponent);
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

  const title = () => q('remote-coach-switch')?.getAttribute('title');

  it('shows nothing during server rendering', async () => {
    await create({ platform: 'server' });
    expect(q('remote-coach-switch')).toBeNull();
    expect(q('remote-coach-doc')).toBeNull();
  });

  it('links a logged-out visitor to the blog post instead of the switch', async () => {
    await create({ loggedIn: false });
    expect(q('remote-coach-switch')).toBeNull();
    expect(q('remote-coach-doc')?.getAttribute('href')).toBe(REMOTE_COACH_DOC);
  });

  it('turns on only after the confirmation, and off in one click', async () => {
    await create();
    expect(title()).toBe('Turn on Remote coach');
    expect(q('remote-coach-switch')?.getAttribute('aria-checked')).toBe('false');
    await click('remote-coach-switch');
    expect(q('remote-coach-confirm')?.textContent).toContain('until you turn this off or close the tab');
    expect(bridge.enable).not.toHaveBeenCalled();

    await click('remote-coach-confirm-yes');
    await vi.waitFor(() => expect(bridge.enable).toHaveBeenCalledOnce());
    fixture.detectChanges();
    expect(q('remote-coach-confirm')).toBeNull();
    expect(q('remote-coach-switch')?.getAttribute('aria-checked')).toBe('true');
    expect(q('remote-coach-switch')?.classList).toContain('look-on');

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

  it('tells in its tooltip who controls the tab, and whether it connects or failed', async () => {
    await create();
    await turnOn();
    expect(title()).toBe('Remote coach on');
    bridge.lastClient.set('Laptop assistant');
    fixture.detectChanges();
    expect(title()).toBe('Controlled by Laptop assistant');
    bridge.state.set('connecting');
    fixture.detectChanges();
    expect(title()).toBe('Connecting…');
    expect(q('remote-coach-switch')?.classList).toContain('look-connecting');
    bridge.state.set('error');
    fixture.detectChanges();
    expect(title()).toBe('Remote coach could not connect');
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

  it('links to the blog post for a user without a grant that can drive the player', async () => {
    await create({ hasGrant: false });
    expect(presence.refresh).toHaveBeenCalledOnce();
    expect(q('remote-coach-switch')).toBeNull();
    expect(q('remote-coach-doc')).not.toBeNull();
  });

  it('asks for the grants once per login, not each time the session is refreshed', async () => {
    await create({ hasGrant: false });
    loggedIn.next(true); // the session refreshed from the server, still logged in
    loggedIn.next(true);
    expect(presence.refresh).toHaveBeenCalledOnce();

    loggedIn.next(false);
    loggedIn.next(true); // logged in again
    expect(presence.refresh).toHaveBeenCalledTimes(2);
  });

  it('becomes a switch once a grant shows up, and a link again on logout', async () => {
    await create({ hasGrant: false });
    presence.hasPlayerGrant.set(true);
    fixture.detectChanges();
    expect(q('remote-coach-switch')).not.toBeNull();
    loggedIn.next(false);
    fixture.detectChanges();
    expect(presence.reset).toHaveBeenCalled();
    expect(q('remote-coach-switch')).toBeNull();
    expect(q('remote-coach-doc')).not.toBeNull();
  });

  it('without a grant, the Connect page link still turns it on, and it then shows', async () => {
    await create({ hasGrant: false, url: '/coach/connect?remoteCoach=1' });
    await fixture.whenStable();
    expect(q('remote-coach-switch')).toBeNull();
    await click('remote-coach-confirm-yes');
    await vi.waitFor(() => expect(bridge.enable).toHaveBeenCalledOnce());
    fixture.detectChanges();
    expect(title()).toBe('Remote coach on');
  });
});
