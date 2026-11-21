import { ComponentFixture, TestBed } from '@angular/core/testing';
import { PLATFORM_ID } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { Router, provideRouter } from '@angular/router';
import { of, throwError, type Observable } from 'rxjs';
import { vi } from 'vitest';
import { OauthService, type OAuthRequestView } from '../../core/api';
import { SessionStorageService } from '../../account/services/session-storage.service';
import { AuthorizeComponent, LEAVE_APP } from './authorize.component';

describe('AuthorizeComponent', () => {
  let fixture: ComponentFixture<AuthorizeComponent>;
  let api: { oauthRequestsIdGet: ReturnType<typeof vi.fn>; oauthRequestsIdDecisionPost: ReturnType<typeof vi.fn> };
  let leave: ReturnType<typeof vi.fn>;

  const VERIFIED: OAuthRequestView = {
    clientName: 'Claude', clientHost: 'claude.ai', redirectHost: 'claude.ai', loopbackOnly: false,
    scopes: ['practice:read', 'scores:read', 'player:control'], expiresAt: '2026-11-17T10:10:00Z',
  };

  async function create(options: {
    view?: OAuthRequestView | HttpErrorResponse; loggedIn?: boolean; url?: string;
    decision?: () => Observable<unknown>;
  } = {}) {
    const view = options.view ?? VERIFIED;
    api = {
      oauthRequestsIdGet: vi.fn(() => (view instanceof HttpErrorResponse ? throwError(() => view) : of(view))),
      oauthRequestsIdDecisionPost: vi.fn(options.decision ?? (() => of({ redirectUrl: 'https://claude.ai/api/mcp/auth_callback?code=c&state=s&iss=x' }))),
    };
    leave = vi.fn();
    TestBed.configureTestingModule({
      imports: [AuthorizeComponent],
      providers: [
        provideRouter([{ path: '**', component: AuthorizeComponent }]),
        { provide: PLATFORM_ID, useValue: 'browser' },
        { provide: OauthService, useValue: api },
        { provide: LEAVE_APP, useValue: leave },
        { provide: SessionStorageService, useValue: { getUserId: () => (options.loggedIn ?? true ? 'u1' : null) } },
      ],
    });
    await TestBed.inject(Router).navigateByUrl(options.url ?? '/coach/authorize?request=req-1');
    fixture = TestBed.createComponent(AuthorizeComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  const el = () => fixture.nativeElement as HTMLElement;
  const q = <T extends HTMLElement = HTMLElement>(id: string) => el().querySelector<T>(`[data-testid="${id}"]`);
  const click = (id: string) => {
    q(id)!.click();
    fixture.detectChanges();
  };

  it('shows who asks, where the browser goes next, and every requested permission', async () => {
    await create();
    expect(api.oauthRequestsIdGet).toHaveBeenCalledWith('req-1');
    expect(q('authorize-client-name')?.textContent).toContain('Claude');
    expect(q('authorize-client-host')?.textContent).toContain('claude.ai');
    expect(q('authorize-unverified')).toBeNull();
    expect(q('authorize-redirect-host')?.textContent).toContain('claude.ai');
    expect(q('authorize-loopback')).toBeNull();
    expect(q('authorize-scopes')?.textContent).toContain('Practice history');
    expect(q('authorize-scopes')?.textContent).toContain('Player');
    expect(q<HTMLInputElement>('authorize-scope-player:control')!.checked).toBe(true);
  });

  it('says so when nobody vouches for the name, and warns about local-only applications', async () => {
    await create({ view: { ...VERIFIED, clientName: 'My harness', clientHost: null, redirectHost: '127.0.0.1', loopbackOnly: true } });
    expect(q('authorize-client-host')).toBeNull();
    expect(q('authorize-unverified')?.textContent).toContain('not verified');
    expect(q('authorize-loopback')?.textContent).toContain('Any program on this computer');
  });

  it('allows with the chosen permissions, then leaves for the returned URL', async () => {
    await create();
    q<HTMLInputElement>('authorize-scope-player:control')!.click();
    fixture.detectChanges();
    click('authorize-allow');
    expect(api.oauthRequestsIdDecisionPost).toHaveBeenCalledWith('req-1', { approve: true, scopes: ['practice:read', 'scores:read'] });
    expect(leave).toHaveBeenCalledWith('https://claude.ai/api/mcp/auth_callback?code=c&state=s&iss=x');
  });

  it('cannot allow with no permission at all', async () => {
    await create({ view: { ...VERIFIED, scopes: ['scores:read'] } });
    q<HTMLInputElement>('authorize-scope-scores:read')!.click();
    fixture.detectChanges();
    expect(q<HTMLButtonElement>('authorize-allow')!.disabled).toBe(true);
  });

  it('refuses, then leaves for the returned URL', async () => {
    await create({ decision: () => of({ redirectUrl: 'https://claude.ai/cb?error=access_denied' }) });
    click('authorize-refuse');
    expect(api.oauthRequestsIdDecisionPost).toHaveBeenCalledWith('req-1', { approve: false, scopes: undefined });
    expect(leave).toHaveBeenCalledWith('https://claude.ai/cb?error=access_denied');
  });

  it('sends a logged-out user to login, keeping the request in the return URL', async () => {
    await create({ loggedIn: false });
    const url = TestBed.inject(Router).url;
    expect(url).toMatch(/^\/account\/login\?returnUrl=/);
    expect(decodeURIComponent(url)).toContain('/coach/authorize?request=req-1');
    expect(api.oauthRequestsIdGet).not.toHaveBeenCalled();
  });

  it('explains an expired, answered or unknown request', async () => {
    await create({ view: new HttpErrorResponse({ status: 404 }) });
    expect(q('authorize-gone')).not.toBeNull();
    TestBed.resetTestingModule();
    await create({ url: '/coach/authorize' });
    expect(q('authorize-gone')).not.toBeNull();
    expect(api.oauthRequestsIdGet).not.toHaveBeenCalled();
  });

  it('tells a load failure from an expired request', async () => {
    await create({ view: new HttpErrorResponse({ status: 500 }) });
    expect(q('authorize-error')).not.toBeNull();
  });

  it('a failed decision can be tried again; one answered meanwhile is gone', async () => {
    await create({ decision: () => throwError(() => new HttpErrorResponse({ status: 500 })) });
    click('authorize-allow');
    expect(q('authorize-decision-error')).not.toBeNull();
    expect(q<HTMLButtonElement>('authorize-allow')!.disabled).toBe(false);
    expect(leave).not.toHaveBeenCalled();

    api.oauthRequestsIdDecisionPost.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 404 })));
    click('authorize-allow');
    expect(q('authorize-gone')).not.toBeNull();
  });
});
