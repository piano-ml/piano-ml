import { TestBed } from '@angular/core/testing';
import { PLATFORM_ID } from '@angular/core';
import { ActivatedRouteSnapshot, Router, RouterStateSnapshot, UrlTree, provideRouter } from '@angular/router';
import { AuthService } from '../account/services/auth.service';
import { adminGuard } from './admin.guard';

function run(session: { userId: string | null; admin: boolean }, platform = 'browser') {
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      { provide: PLATFORM_ID, useValue: platform },
      { provide: AuthService, useValue: { isAdmin: () => session.admin, getUserId: () => session.userId } },
    ],
  });
  const state = { url: '/admin/errors?source=BACKEND' } as RouterStateSnapshot;
  return TestBed.runInInjectionContext(() => adminGuard({} as ActivatedRouteSnapshot, state));
}

const serialize = (result: unknown) => TestBed.inject(Router).serializeUrl(result as UrlTree);

describe('adminGuard', () => {
  it('lets an admin through', () => {
    expect(run({ userId: 'u1', admin: true })).toBe(true);
  });

  it('sends an anonymous visitor to login, coming back to the admin page', () => {
    const result = run({ userId: null, admin: false });
    expect(result).toBeInstanceOf(UrlTree);
    expect(serialize(result)).toBe('/account/login?returnUrl=%2Fadmin%2Ferrors%3Fsource%3DBACKEND');
  });

  it('sends a logged-in USER to the home page', () => {
    const result = run({ userId: 'u2', admin: false });
    expect(serialize(result)).toBe('/');
  });

  it('never activates on the server', () => {
    expect(run({ userId: null, admin: false }, 'server')).toBe(false);
  });
});
