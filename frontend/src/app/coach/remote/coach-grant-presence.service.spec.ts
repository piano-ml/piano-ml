import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { vi } from 'vitest';
import { AccountGrantsService, CoachGrantScope, type CoachGrantApiInfo } from '../../core/api';
import { CoachGrantPresenceService } from './coach-grant-presence.service';

describe('CoachGrantPresenceService', () => {
  const future = new Date(Date.now() + 86_400_000).toISOString();
  const past = new Date(Date.now() - 86_400_000).toISOString();
  const grant = (over: Partial<CoachGrantApiInfo> = {}): CoachGrantApiInfo => ({
    id: 'g1', name: 'Laptop', kind: 'pat', scopes: [CoachGrantScope.PlayerControl],
    createdAt: past, expiresAt: future, ...over,
  } as CoachGrantApiInfo);

  function service(result: CoachGrantApiInfo[] | Error) {
    TestBed.configureTestingModule({
      providers: [{ provide: AccountGrantsService, useValue: {
        accountGrantsGet: vi.fn(() => (result instanceof Error ? throwError(() => result) : of(result))),
      } }],
    });
    return TestBed.inject(CoachGrantPresenceService);
  }

  it('counts only a live grant with the player scope', () => {
    const s = service([]);
    s.update([grant()]);
    expect(s.hasPlayerGrant()).toBe(true);
    s.update([grant({ revokedAt: past })]);
    expect(s.hasPlayerGrant()).toBe(false);
    s.update([grant({ expiresAt: past })]);
    expect(s.hasPlayerGrant()).toBe(false);
    s.update([grant({ scopes: [CoachGrantScope.PracticeRead, CoachGrantScope.ScoresRead] })]);
    expect(s.hasPlayerGrant()).toBe(false);
    s.update([grant({ expiresAt: past }), grant({ id: 'g2' })]);
    expect(s.hasPlayerGrant()).toBe(true);
  });

  it('asks the server, and treats a failure (no coach backend) as no grant', () => {
    const s = service([grant()]);
    s.refresh();
    expect(s.hasPlayerGrant()).toBe(true);
    TestBed.resetTestingModule();
    const failing = service(new Error('404'));
    failing.hasPlayerGrant.set(true);
    failing.refresh();
    expect(failing.hasPlayerGrant()).toBe(false);
  });
});
