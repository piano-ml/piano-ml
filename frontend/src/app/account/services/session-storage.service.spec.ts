import { PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { SessionStorageService } from './session-storage.service';

describe('SessionStorageService', () => {
  function create(platform: 'browser' | 'server' = 'browser') {
    TestBed.configureTestingModule({ providers: [{ provide: PLATFORM_ID, useValue: platform }] });
    return TestBed.inject(SessionStorageService);
  }

  const loggedIn = (service: SessionStorageService) => firstValueFrom(service.isLoggedIn);

  beforeEach(() => localStorage.clear());
  afterEach(() => localStorage.clear());

  describe('in the browser', () => {
    it('starts logged out without a stored session', async () => {
      const service = create();
      expect(await loggedIn(service)).toBe(false);
      expect(service.getUserId()).toBeNull();
      expect(service.isAdmin()).toBe(false);
    });

    it('starts logged in when a session survived a reload', async () => {
      localStorage.setItem('userId', 'u1');
      const service = create();
      expect(await loggedIn(service)).toBe(true);
      expect(service.getUserId()).toBe('u1');
    });

    it('stores the session and reports the login', async () => {
      const service = create();
      service.persistSessionData({ userId: 'u1', username: 'Alice', roles: 'USER' });
      expect(localStorage.getItem('userId')).toBe('u1');
      expect(localStorage.getItem('username')).toBe('Alice');
      expect(localStorage.getItem('roles')).toBe('USER');
      expect(await loggedIn(service)).toBe(true);
    });

    it('removes the fields given as null and keeps the ones not given', async () => {
      const service = create();
      service.persistSessionData({ userId: 'u1', username: 'Alice', roles: 'USER' });
      service.persistSessionData({ username: null });
      expect(localStorage.getItem('username')).toBeNull();
      expect(localStorage.getItem('userId')).toBe('u1');
      expect(localStorage.getItem('roles')).toBe('USER');

      service.persistSessionData({ userId: null, roles: null });
      expect(localStorage.getItem('userId')).toBeNull();
      expect(localStorage.getItem('roles')).toBeNull();
      expect(await loggedIn(service)).toBe(false);
    });

    it.each([
      ['ADMIN', true],
      ['USER, ADMIN', true],
      ['USER,ADMIN ', true],
      ['USER', false],
      ['ADMINISTRATOR', false],
    ])('isAdmin() with roles %j is %s', (roles, expected) => {
      const service = create();
      service.persistSessionData({ userId: 'u1', roles });
      expect(service.isAdmin()).toBe(expected);
    });

    it('clears everything and reports the logout once', async () => {
      const service = create();
      service.persistSessionData({ userId: 'u1', username: 'Alice', roles: 'ADMIN' });
      const states: boolean[] = [];
      const sub = service.isLoggedIn.subscribe((s) => states.push(s));

      service.clearSession();
      service.clearSession(); // already logged out: no second notification
      sub.unsubscribe();

      expect(['userId', 'username', 'roles'].map((k) => localStorage.getItem(k))).toEqual([null, null, null]);
      expect(states).toEqual([true, false]);
    });
  });

  describe('during server-side rendering', () => {
    it('never reads or writes localStorage and is always logged out', async () => {
      localStorage.setItem('userId', 'u1');
      localStorage.setItem('roles', 'ADMIN');
      const service = create('server');

      expect(await loggedIn(service)).toBe(false);
      expect(service.getUserId()).toBeNull();
      expect(service.isAdmin()).toBe(false);

      service.persistSessionData({ userId: 'u2' });
      service.clearSession();
      expect(localStorage.getItem('userId')).toBe('u1'); // untouched
    });
  });
});
