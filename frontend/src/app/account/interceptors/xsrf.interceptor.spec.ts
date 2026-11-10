import { TestBed } from '@angular/core/testing';
import { DOCUMENT } from '@angular/common';
import { HttpClient, provideHttpClient, withInterceptors, withNoXsrfProtection } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { PLATFORM_ID } from '@angular/core';
import { readCookie, XSRF_API_BASE, XSRF_HEADER_NAME, xsrfInterceptor } from './xsrf.interceptor';

const API = 'https://api.example.test';

function setup(cookie: string, platform: 'browser' | 'server' = 'browser') {
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(withNoXsrfProtection(), withInterceptors([xsrfInterceptor])),
      provideHttpClientTesting(),
      { provide: XSRF_API_BASE, useValue: API },
      { provide: PLATFORM_ID, useValue: platform },
      { provide: DOCUMENT, useValue: { cookie } },
    ],
  });
  return { http: TestBed.inject(HttpClient), httpMock: TestBed.inject(HttpTestingController) };
}

describe('xsrfInterceptor', () => {
  afterEach(() => TestBed.inject(HttpTestingController).verify());

  for (const method of ['POST', 'PUT', 'DELETE', 'PATCH']) {
    it(`adds ${XSRF_HEADER_NAME} on ${method} to the API`, () => {
      const { http, httpMock } = setup('foo=bar; XSRF-TOKEN=tok-123; other=1');
      http.request(method, `${API}/author/1`, { body: {} }).subscribe();
      const req = httpMock.expectOne(`${API}/author/1`);
      expect(req.request.headers.get(XSRF_HEADER_NAME)).toBe('tok-123');
      req.flush({});
    });
  }

  it('does not add the header on safe methods', () => {
    const { http, httpMock } = setup('XSRF-TOKEN=tok-123');
    http.get(`${API}/author/1`).subscribe();
    const req = httpMock.expectOne(`${API}/author/1`);
    expect(req.request.headers.has(XSRF_HEADER_NAME)).toBe(false);
    req.flush({});
  });

  it('never sends the token to another host', () => {
    const { http, httpMock } = setup('XSRF-TOKEN=tok-123');
    http.post('https://evil.example/collect', {}).subscribe();
    const req = httpMock.expectOne('https://evil.example/collect');
    expect(req.request.headers.has(XSRF_HEADER_NAME)).toBe(false);
    req.flush({});
  });

  it('leaves the request untouched when no token cookie exists yet', () => {
    const { http, httpMock } = setup('foo=bar');
    http.post(`${API}/account/login`, {}).subscribe();
    const req = httpMock.expectOne(`${API}/account/login`);
    expect(req.request.headers.has(XSRF_HEADER_NAME)).toBe(false);
    req.flush({});
  });

  it('does nothing during server-side rendering', () => {
    const { http, httpMock } = setup('XSRF-TOKEN=tok-123', 'server');
    http.post(`${API}/score/play/stats`, {}).subscribe();
    const req = httpMock.expectOne(`${API}/score/play/stats`);
    expect(req.request.headers.has(XSRF_HEADER_NAME)).toBe(false);
    req.flush({});
  });

  it('keeps a header set explicitly by the caller', () => {
    const { http, httpMock } = setup('XSRF-TOKEN=tok-123');
    http.put(`${API}/author/1`, {}, { headers: { [XSRF_HEADER_NAME]: 'explicit' } }).subscribe();
    const req = httpMock.expectOne(`${API}/author/1`);
    expect(req.request.headers.get(XSRF_HEADER_NAME)).toBe('explicit');
    req.flush({});
  });
});

describe('readCookie', () => {
  it('finds a cookie among others and decodes it', () => {
    expect(readCookie('a=1; XSRF-TOKEN=x%3Dy; b=2', 'XSRF-TOKEN')).toBe('x=y');
  });

  it('returns null when absent', () => {
    expect(readCookie('a=1', 'XSRF-TOKEN')).toBeNull();
  });

  it('does not match on a name suffix', () => {
    expect(readCookie('MY-XSRF-TOKEN=nope', 'XSRF-TOKEN')).toBeNull();
  });
});
