import { CoachGrantPresenceService } from '../../../coach/remote/coach-grant-presence.service';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { vi } from 'vitest';
import { AccountGrantsService, type CoachGrantApiInfo, type CoachGrantCreated } from '../../../core/api';
import { CoachGrantsComponent } from './coach-grants.component';

const FUTURE = '2099-01-01T00:00:00Z';
const PAST = '2020-01-01T00:00:00Z';
const ACTIVE: CoachGrantApiInfo = {
  id: 'g1', name: 'Laptop assistant', kind: 'pat', scopes: ['practice:read', 'scores:read'],
  createdAt: '2026-11-01T10:00:00Z', expiresAt: FUTURE, lastUsedAt: '2026-11-15T10:00:00Z',
};
const REVOKED: CoachGrantApiInfo = { ...ACTIVE, id: 'g2', name: 'Old tool', revokedAt: '2026-11-10T10:00:00Z' };
const EXPIRED: CoachGrantApiInfo = { ...ACTIVE, id: 'g3', name: 'Expired tool', expiresAt: PAST, lastUsedAt: undefined };
const CREATED: CoachGrantCreated = { ...ACTIVE, id: 'g4', name: 'New', token: 'pml_0123_secret' };

describe('CoachGrantsComponent', () => {
  let fixture: ComponentFixture<CoachGrantsComponent>;
  let api: Record<'accountGrantsGet' | 'accountGrantsPost' | 'accountGrantsIdDelete', ReturnType<typeof vi.fn>>;

  function create(grants: CoachGrantApiInfo[] | Error = [ACTIVE, REVOKED, EXPIRED]) {
    api = {
      accountGrantsGet: vi.fn(() => (grants instanceof Error ? throwError(() => grants) : of(grants))),
      accountGrantsPost: vi.fn(() => of(CREATED)),
      accountGrantsIdDelete: vi.fn(() => of(null)),
    };
    TestBed.configureTestingModule({
      imports: [CoachGrantsComponent],
      providers: [provideRouter([]), { provide: AccountGrantsService, useValue: api }],
    });
    fixture = TestBed.createComponent(CoachGrantsComponent);
    fixture.detectChanges();
  }

  const el = () => fixture.nativeElement as HTMLElement;
  const q = <T extends Element = HTMLElement>(testId: string) => el().querySelector<T>(`[data-testid="${testId}"]`);
  const click = (testId: string) => {
    q<HTMLButtonElement>(testId)!.click();
    fixture.detectChanges();
  };
  const type = (testId: string, value: string) => {
    const input = q<HTMLInputElement>(testId)!;
    input.value = value;
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  };

  it('shows the privacy notice above the list', () => {
    create();
    expect(q('coach-grant-notice')?.textContent).toContain('sent to the AI provider used by that tool');
  });

  it('lists the grants with their scopes, dates and status', () => {
    create();
    const rows = el().querySelectorAll('[data-testid="coach-grant"]');
    expect(rows).toHaveLength(3);
    expect(rows[0].textContent).toContain('Laptop assistant');
    expect(rows[0].textContent).toContain('Practice history · Score library');
    expect(rows[0].textContent).toContain('Last used');
    expect(rows[0].querySelector('[data-testid="coach-grant-revoke"]')).not.toBeNull();
    expect(rows[1].querySelector('[data-testid="coach-grant-status"]')?.textContent).toContain('Revoked');
    expect(rows[2].querySelector('[data-testid="coach-grant-status"]')?.textContent).toContain('Expired');
    expect(rows[2].textContent).toContain('Never used');
  });

  it('says so when there is no grant, and when the list cannot be loaded', () => {
    create([]);
    expect(q('coach-grant-empty')).not.toBeNull();
    TestBed.resetTestingModule();
    create(new Error('offline'));
    expect(q('coach-grant-empty')).not.toBeNull();
  });

  it('creates a grant with the name, the chosen scopes and expiry, then shows the token once', () => {
    create();
    click('coach-grant-new');
    expect(q<HTMLButtonElement>('coach-grant-submit')!.disabled).toBe(true);
    type('coach-grant-name', '  My assistant  ');
    click('coach-grant-scope-player:control');
    q<HTMLButtonElement>('coach-grant-submit')!.click();
    fixture.detectChanges();

    expect(api.accountGrantsPost).toHaveBeenCalledWith({
      name: 'My assistant', scopes: ['practice:read', 'scores:read'], expiresInDays: 90,
    });
    expect(q<HTMLInputElement>('coach-grant-token')!.value).toBe('pml_0123_secret');
    expect(api.accountGrantsGet).toHaveBeenCalledTimes(2);

    click('coach-grant-token-done');
    expect(q('coach-grant-token')).toBeNull();
    expect(el().textContent).not.toContain('pml_0123_secret');
  });

  it('cannot submit without a scope or with a blank name', () => {
    create();
    click('coach-grant-new');
    type('coach-grant-name', '   ');
    expect(q<HTMLButtonElement>('coach-grant-submit')!.disabled).toBe(true);
    type('coach-grant-name', 'Tool');
    for (const scope of ['practice:read', 'scores:read', 'player:control']) {
      click(`coach-grant-scope-${scope}`);
    }
    expect(q<HTMLButtonElement>('coach-grant-submit')!.disabled).toBe(true);
  });

  it('copies the token to the clipboard', async () => {
    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    create();
    click('coach-grant-new');
    type('coach-grant-name', 'Tool');
    q<HTMLButtonElement>('coach-grant-submit')!.click();
    fixture.detectChanges();

    await fixture.componentInstance.copyToken();
    fixture.detectChanges();
    expect(writeText).toHaveBeenCalledWith('pml_0123_secret');
    expect(q('coach-grant-copy')?.textContent).toContain('Copied');
  });

  it('explains a refusal: too many live grants, or too many creations', () => {
    create();
    click('coach-grant-new');
    for (const [status, text] of [[409, 'Revoke one first'], [429, 'last hour'], [500, 'could not be created']] as const) {
      api.accountGrantsPost.mockReturnValueOnce(throwError(() => new HttpErrorResponse({ status })));
      type('coach-grant-name', 'Tool');
      q<HTMLButtonElement>('coach-grant-submit')!.click();
      fixture.detectChanges();
      expect(q('coach-grant-error')?.textContent).toContain(text);
      expect(q('coach-grant-token')).toBeNull();
      // The form stays open with the input, for another try
      expect(q('coach-grant-form')).not.toBeNull();
    }
  });

  it('tells its host page about the token it created, and links to the Connect page', () => {
    create();
    const tokens: string[] = [];
    fixture.componentInstance.created.subscribe(token => tokens.push(token));
    expect(q('coach-grant-connect')?.getAttribute('href')).toBe('/coach/connect');
    click('coach-grant-new');
    type('coach-grant-name', 'Tool');
    q<HTMLButtonElement>('coach-grant-submit')!.click();
    expect(tokens).toEqual(['pml_0123_secret']);
  });

  it('revokes only after a confirmation, then reloads', () => {
    create();
    click('coach-grant-revoke');
    expect(api.accountGrantsIdDelete).not.toHaveBeenCalled();
    click('coach-grant-revoke-confirm');
    expect(api.accountGrantsIdDelete).toHaveBeenCalledWith('g1');
    expect(api.accountGrantsGet).toHaveBeenCalledTimes(2);
  });

  it('tells the Remote coach switch whether a live player grant exists, without asking again', () => {
    create([{ ...ACTIVE, scopes: ['player:control'] }]);
    expect(TestBed.inject(CoachGrantPresenceService).hasPlayerGrant()).toBe(true);
    expect(api.accountGrantsGet).toHaveBeenCalledOnce();
    TestBed.resetTestingModule();
    create([ACTIVE, REVOKED, EXPIRED]); // no live grant with the player scope
    expect(TestBed.inject(CoachGrantPresenceService).hasPlayerGrant()).toBe(false);
  });
});
