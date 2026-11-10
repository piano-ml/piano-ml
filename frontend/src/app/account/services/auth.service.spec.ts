import { TestBed } from '@angular/core/testing';
import { PLATFORM_ID } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { Router } from '@angular/router';
import { BehaviorSubject, of, throwError } from 'rxjs';
import { vi } from 'vitest';

import { AuthService } from './auth.service';
import { SessionStorageService } from './session-storage.service';
import { AccountService } from '../../core/api';

describe('AuthService', () => {
  let api: Record<string, ReturnType<typeof vi.fn>>;
  let session: {
    isLoggedIn: BehaviorSubject<boolean>;
    getUserId: ReturnType<typeof vi.fn>;
    isAdmin: ReturnType<typeof vi.fn>;
    persistSessionData: ReturnType<typeof vi.fn>;
    clearSession: ReturnType<typeof vi.fn>;
  };
  let router: { url: string; navigate: ReturnType<typeof vi.fn> };

  function create(platform: 'browser' | 'server' = 'browser', userId: string | null = null): AuthService {
    session.getUserId.mockReturnValue(userId);
    TestBed.configureTestingModule({
      providers: [
        { provide: AccountService, useValue: api },
        { provide: SessionStorageService, useValue: session },
        { provide: Router, useValue: router },
        { provide: PLATFORM_ID, useValue: platform },
      ],
    });
    return TestBed.inject(AuthService);
  }

  beforeEach(() => {
    api = {
      accountLoginPost: vi.fn(),
      accountLogoutPost: vi.fn(() => of(undefined)),
      accountDeletePost: vi.fn(() => of(undefined)),
      accountCreatePost: vi.fn(() => of(undefined)),
      accountUserinfoGet: vi.fn(() => of({ id: 'u1', name: 'Alice' })),
      accountUserinfoPut: vi.fn(() => of(undefined)),
    };
    session = {
      isLoggedIn: new BehaviorSubject(false),
      getUserId: vi.fn(() => null),
      isAdmin: vi.fn(() => false),
      persistSessionData: vi.fn(),
      clearSession: vi.fn(),
    };
    router = { url: '/library', navigate: vi.fn() };
  });

  describe('session refresh on startup (browser, logged in)', () => {
    it('refreshes the stored session from the server', () => {
      create('browser', 'u1');
      expect(api['accountUserinfoGet']).toHaveBeenCalledOnce();
      expect(session.persistSessionData).toHaveBeenCalledWith({ userId: 'u1', username: 'Alice' });
    });

    it('stores nulls when the server omits the fields', () => {
      api['accountUserinfoGet'].mockReturnValue(of({}));
      create('browser', 'u1');
      expect(session.persistSessionData).toHaveBeenCalledWith({ userId: null, username: null });
    });

    it('ends the session silently on 401', () => {
      api['accountUserinfoGet'].mockReturnValue(throwError(() => new HttpErrorResponse({ status: 401 })));
      create('browser', 'u1');
      expect(session.clearSession).toHaveBeenCalledOnce();
      expect(router.navigate).not.toHaveBeenCalled();
    });

    it('keeps the session on 403 or network errors', () => {
      for (const status of [403, 0, 500]) {
        api['accountUserinfoGet'].mockReturnValue(throwError(() => new HttpErrorResponse({ status })));
        TestBed.resetTestingModule();
        create('browser', 'u1');
      }
      expect(session.clearSession).not.toHaveBeenCalled();
    });

    it('does nothing when not logged in, or during server-side rendering', () => {
      create('browser', null);
      TestBed.resetTestingModule();
      create('server', 'u1');
      expect(api['accountUserinfoGet']).not.toHaveBeenCalled();
    });
  });

  it('exposes login state, user id and admin flag from the session store', () => {
    const service = create('server', 'u1');
    session.isAdmin.mockReturnValue(true);
    expect(service.isLoggedIn).toBe(session.isLoggedIn);
    expect(service.getUserId()).toBe('u1');
    expect(service.isAdmin()).toBe(true);
  });

  describe('login', () => {
    it('stores the session and refreshes from the server, leaving navigation to the caller', () => {
      api['accountLoginPost'].mockReturnValue(of({ userId: 'u1', username: 'Alice', roles: 'USER' }));
      const service = create('browser', null);
      session.getUserId.mockReturnValue('u1');

      service.login({ email: 'a@example.com', password: 'pw' }).subscribe();

      expect(session.persistSessionData).toHaveBeenCalledWith({ userId: 'u1', username: 'Alice', roles: 'USER' });
      expect(router.navigate).not.toHaveBeenCalled();
      expect(api['accountUserinfoGet']).toHaveBeenCalledOnce();
    });

    it('stores nulls for missing fields and skips the refresh during SSR', () => {
      api['accountLoginPost'].mockReturnValue(of({}));
      const service = create('server', null);

      service.login({ email: 'a@example.com', password: 'pw' }).subscribe();

      expect(session.persistSessionData).toHaveBeenCalledWith({ userId: null, username: null, roles: null });
      expect(api['accountUserinfoGet']).not.toHaveBeenCalled();
    });
  });

  describe('logout', () => {
    it('POSTs /account/logout, clears the session and goes to login', () => {
      const service = create();
      service.logout();
      expect(api['accountLogoutPost']).toHaveBeenCalledOnce();
      expect(session.clearSession).toHaveBeenCalledOnce();
      expect(router.navigate).toHaveBeenCalledWith(['/account/login']);
    });

    it('clears the session even when the logout request fails', () => {
      api['accountLogoutPost'].mockReturnValue(throwError(() => new HttpErrorResponse({ status: 500 })));
      const service = create();
      service.logout();
      expect(session.clearSession).toHaveBeenCalledOnce();
      expect(router.navigate).toHaveBeenCalledWith(['/account/login']);
    });

    it('does not navigate when already on the login page, nor during SSR', () => {
      router.url = '/account/login';
      create().logout();
      expect(router.navigate).not.toHaveBeenCalled();

      TestBed.resetTestingModule();
      router.url = '/library';
      create('server').logout();
      expect(router.navigate).not.toHaveBeenCalled();
      expect(session.clearSession).toHaveBeenCalledTimes(2);
    });
  });

  it('deleteAccount POSTs /account/delete without a body', () => {
    const service = create();
    let done = false;
    service.deleteAccount().subscribe(() => (done = true));
    expect(api['accountDeletePost']).toHaveBeenCalledWith();
    expect(done).toBe(true);
  });

  it('register, getUserInfo and updateUserInfo delegate to the API', () => {
    const service = create('server');
    const user = { email: 'a@example.com', password: 'pw', name: 'a' };
    service.register(user).subscribe();
    service.getUserInfo().subscribe();
    service.updateUserInfo({ name: 'b' }).subscribe();
    expect(api['accountCreatePost']).toHaveBeenCalledWith(user);
    expect(api['accountUserinfoGet']).toHaveBeenCalledOnce();
    expect(api['accountUserinfoPut']).toHaveBeenCalledWith({ name: 'b' });
  });

  it('handleUnauthorized clears the session and redirects to login, remembering the page', () => {
    const service = create();
    service.handleUnauthorized();
    expect(session.clearSession).toHaveBeenCalledOnce();
    expect(router.navigate).toHaveBeenCalledWith(['/account/login'], { queryParams: { returnUrl: '/library' } });
  });
});
