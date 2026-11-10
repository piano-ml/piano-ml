import { TestBed } from '@angular/core/testing';
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Router } from '@angular/router';
import { vi } from 'vitest';

import { authInterceptor } from './auth.interceptor';
import { SessionStorageService } from '../services/session-storage.service';

describe('authInterceptor', () => {
  let http: HttpClient;
  let httpMock: HttpTestingController;
  const clearSession = vi.fn();
  const navigate = vi.fn();

  beforeEach(() => {
    clearSession.mockReset();
    navigate.mockReset();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        { provide: SessionStorageService, useValue: { clearSession } },
        { provide: Router, useValue: { url: '/library', navigate } },
      ],
    });
    http = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  function failWith(status: number, body: object | null = null): number {
    let received = 0;
    http.put('/api/author/1', {}).subscribe({ error: e => (received = e.status) });
    httpMock.expectOne('/api/author/1').flush(body, { status, statusText: 'x' });
    return received;
  }

  it('ends the session and redirects to login on 401', () => {
    expect(failWith(401)).toBe(401);
    expect(clearSession).toHaveBeenCalledOnce();
    expect(navigate).toHaveBeenCalledWith(['/account/login']);
  });

  it('keeps the session on a CSRF 403', () => {
    expect(failWith(403, { error: 'CSRF_TOKEN_INVALID' })).toBe(403);
    expect(clearSession).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
  });

  it('keeps the session on a plain 403 (not allowed)', () => {
    expect(failWith(403)).toBe(403);
    expect(clearSession).not.toHaveBeenCalled();
  });

  it('does not navigate again when already on the login page', () => {
    (TestBed.inject(Router) as unknown as { url: string }).url = '/account/login';
    expect(failWith(401)).toBe(401);
    expect(clearSession).toHaveBeenCalledOnce();
    expect(navigate).not.toHaveBeenCalled();
  });
});
