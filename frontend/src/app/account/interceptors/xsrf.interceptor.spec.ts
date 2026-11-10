import { TestBed } from '@angular/core/testing';
import { DOCUMENT } from '@angular/common';
import { HttpClient, HttpErrorResponse, provideHttpClient, withInterceptors, withNoXsrfProtection } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { PLATFORM_ID } from '@angular/core';
import { CSRF_ERROR_CODE, isCsrfRejection, readCookie, XSRF_API_BASE, XSRF_HEADER_NAME, xsrfInterceptor } from './xsrf.interceptor';

const API = 'https://api.example.test';

function setup(cookie: string, platform: 'browser' | 'server' = 'browser') {
  const doc = { cookie };
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(withNoXsrfProtection(), withInterceptors([xsrfInterceptor])),
      provideHttpClientTesting(),
      { provide: XSRF_API_BASE, useValue: API },
      { provide: PLATFORM_ID, useValue: platform },
      { provide: DOCUMENT, useValue: doc },
    ],
  });
  return { http: TestBed.inject(HttpClient), httpMock: TestBed.inject(HttpTestingController), doc };
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

describe('xsrfInterceptor CSRF retry', () => {
  afterEach(() => TestBed.inject(HttpTestingController).verify());

  const csrf403 = { status: 403, statusText: 'Forbidden' };

  it('retries once with the fresh token handed out by the CSRF rejection', () => {
    const { http, httpMock, doc } = setup('XSRF-TOKEN=stale');
    let result: unknown;
    http.put(`${API}/author/1`, {}).subscribe(r => (result = r));

    const first = httpMock.expectOne(`${API}/author/1`);
    expect(first.request.headers.get(XSRF_HEADER_NAME)).toBe('stale');
    doc.cookie = 'XSRF-TOKEN=fresh'; // Set-Cookie of the 403 response
    first.flush({ error: CSRF_ERROR_CODE }, csrf403);

    const retry = httpMock.expectOne(`${API}/author/1`);
    expect(retry.request.headers.get(XSRF_HEADER_NAME)).toBe('fresh');
    retry.flush({ ok: true });
    expect(result).toEqual({ ok: true });
  });

  it('retries a first write made before any token cookie existed', () => {
    const { http, httpMock, doc } = setup('');
    http.post(`${API}/score/play/stats`, {}).subscribe();

    const first = httpMock.expectOne(`${API}/score/play/stats`);
    expect(first.request.headers.has(XSRF_HEADER_NAME)).toBe(false);
    doc.cookie = 'XSRF-TOKEN=new';
    first.flush({ error: CSRF_ERROR_CODE }, csrf403);

    httpMock.expectOne(`${API}/score/play/stats`).flush({});
  });

  it('gives up after one retry and surfaces the 403', () => {
    const { http, httpMock } = setup('XSRF-TOKEN=t');
    let status = 0;
    http.put(`${API}/author/1`, {}).subscribe({ error: e => (status = e.status) });

    httpMock.expectOne(`${API}/author/1`).flush({ error: CSRF_ERROR_CODE }, csrf403);
    httpMock.expectOne(`${API}/author/1`).flush({ error: CSRF_ERROR_CODE }, csrf403);
    httpMock.expectNone(`${API}/author/1`);
    expect(status).toBe(403);
  });

  it('does not retry a plain 403 (not allowed)', () => {
    const { http, httpMock } = setup('XSRF-TOKEN=t');
    let status = 0;
    http.put(`${API}/genre/1`, {}).subscribe({ error: e => (status = e.status) });

    httpMock.expectOne(`${API}/genre/1`).flush(null, csrf403);
    httpMock.expectNone(`${API}/genre/1`);
    expect(status).toBe(403);
  });
});

describe('isCsrfRejection', () => {
  it('only matches a 403 carrying the CSRF error code', () => {
    expect(isCsrfRejection(new HttpErrorResponse({ status: 403, error: { error: CSRF_ERROR_CODE } }))).toBe(true);
    expect(isCsrfRejection(new HttpErrorResponse({ status: 403, error: { error: 'ACCESS_DENIED' } }))).toBe(false);
    expect(isCsrfRejection(new HttpErrorResponse({ status: 401, error: { error: CSRF_ERROR_CODE } }))).toBe(false);
    expect(isCsrfRejection(new Error('x'))).toBe(false);
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
