import { TestBed } from '@angular/core/testing';
import { ErrorHandler, PLATFORM_ID } from '@angular/core';
import { HttpClient, HttpErrorResponse, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, TestRequest, provideHttpClientTesting } from '@angular/common/http/testing';
import { Router, provideRouter } from '@angular/router';
import { Component } from '@angular/core';
import { vi } from 'vitest';
import { environment } from '../../../environments/environment';
import { ErrorReportCreate, provideApi } from '../api';
import { ErrorReporter } from './error-reporter.service';
import { errorReportInterceptor } from './error-report.interceptor';
import { ERROR_REPORTING_CONFIG, sanitizeUrl } from './error-reporting.config';
import { provideErrorReporting } from './provide-error-reporting';

const API = environment.api;
const REPORT_URL = `${API}/error-report`;

@Component({ template: '' })
class ScorePage {}

function setup(options: { platform?: 'browser' | 'server'; enabled?: boolean; maxPerPage?: number } = {}) {
  TestBed.configureTestingModule({
    providers: [
      provideRouter([{ path: 'score/:slug', component: ScorePage }, { path: '**', children: [] }]),
      provideHttpClient(withInterceptors([errorReportInterceptor])),
      provideHttpClientTesting(),
      provideApi({ basePath: API }),
      provideErrorReporting(),
      { provide: PLATFORM_ID, useValue: options.platform ?? 'browser' },
      {
        provide: ERROR_REPORTING_CONFIG,
        useValue: { enabled: options.enabled ?? true, maxPerPage: options.maxPerPage ?? 20, dedupMs: 10_000 },
      },
    ],
  });
  return {
    reporter: TestBed.inject(ErrorReporter),
    http: TestBed.inject(HttpClient),
    httpMock: TestBed.inject(HttpTestingController),
  };
}

/** The release is fetched before sending: let its promise settle. */
async function settle(): Promise<void> {
  for (let i = 0; i < 5; i++) {
    await Promise.resolve();
  }
}

async function reports(httpMock: HttpTestingController): Promise<TestRequest[]> {
  await settle();
  return httpMock.match(REPORT_URL);
}

describe('error reporting', () => {
  let consoleError: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ commit: 'abc1234' }) })));
    consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    consoleError.mockRestore();
  });

  it('reports an uncaught error with the page URL, route and release, and still logs it', async () => {
    const { httpMock } = setup();
    await TestBed.inject(Router).navigateByUrl('/score/moonlight-sonata');

    TestBed.inject(ErrorHandler).handleError(new TypeError('x is undefined'));

    const [req] = await reports(httpMock);
    const body = req.request.body as ErrorReportCreate;
    expect(req.request.method).toBe('POST');
    expect(body.url).toBe(sanitizeUrl(window.location.href));
    expect(body.message).toBe('x is undefined');
    expect(body.exceptionType).toBe('TypeError');
    expect(body.stackTrace).toContain('x is undefined');
    expect(body.level).toBe('ERROR');
    expect(body.release).toBe('abc1234');
    expect(body.context).toEqual({ route: '/score/:slug' });
    expect(consoleError).toHaveBeenCalled();
    req.flush(null, { status: 202, statusText: 'Accepted' });
    httpMock.verify();
  });

  it('reports unhandled promise rejections', async () => {
    const { httpMock } = setup();
    const event = new Event('unhandledrejection') as Event & { reason: unknown };
    event.reason = new Error('async boom');
    window.dispatchEvent(event);

    const [req] = await reports(httpMock);
    expect(req.request.body.message).toBe('async boom');
    expect(req.request.body.context.unhandledRejection).toBe(true);
  });

  it('reports a 500 and a network failure of the API, not a 404', async () => {
    const { http, httpMock } = setup();
    const failed = vi.fn();
    http.get(`${API}/score/1?token=secret&tab=pdf`).subscribe({ error: failed });
    http.get(`${API}/score/2`).subscribe({ error: failed });
    http.get(`${API}/score/3`).subscribe({ error: failed });
    httpMock.expectOne(`${API}/score/1?token=secret&tab=pdf`).flush('boom', { status: 500, statusText: 'Server Error' });
    httpMock.expectOne(`${API}/score/2`).flush('missing', { status: 404, statusText: 'Not Found' });
    httpMock.expectOne(`${API}/score/3`).error(new ProgressEvent('error'), { status: 0 });

    const sent = await reports(httpMock);
    expect(failed).toHaveBeenCalledTimes(3); // the caller still gets its error
    expect(sent.map(r => r.request.body.context.status)).toEqual([500, 0]);
    expect(sent[0].request.body.message).toBe(`HTTP 500 GET ${API}/score/1`);
    expect(sent[0].request.body.context.api).toBe(`${API}/score/1?tab=pdf`);
    expect(sent[0].request.body.context.method).toBe('GET');
  });

  it('does not report HTTP errors twice when they reach the ErrorHandler', async () => {
    const { httpMock } = setup();
    TestBed.inject(ErrorHandler).handleError(new HttpErrorResponse({ status: 500, url: `${API}/x` }));
    expect(await reports(httpMock)).toHaveLength(0);
  });

  it('never reports its own failures (no loop) and swallows them', async () => {
    const { reporter, httpMock } = setup();
    reporter.report({ message: 'first' });
    const [req] = await reports(httpMock);
    expect(() => req.flush('down', { status: 503, statusText: 'Unavailable' })).not.toThrow();
    expect(await reports(httpMock)).toHaveLength(0);
  });

  it('never throws, even when sending blows up', async () => {
    const { reporter } = setup();
    vi.stubGlobal('fetch', vi.fn(() => { throw new Error('no fetch'); }));
    const handler = TestBed.inject(ErrorHandler);
    expect(() => handler.handleError(new Error('a'))).not.toThrow();
    expect(() => reporter.reportError(undefined)).not.toThrow();
    expect(() => reporter.reportError({ circular: globalThis })).not.toThrow();
  });

  it('drops an identical report within 10 s, and sends it again later', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      const { reporter, httpMock } = setup();
      const error = new Error('same');
      reporter.reportError(error);
      reporter.reportError(error);
      reporter.reportError(new Error('different'));
      expect(await reports(httpMock)).toHaveLength(2);
      vi.setSystemTime(Date.now() + 11_000);
      reporter.reportError(error);
      expect(await reports(httpMock)).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('sends at most maxPerPage reports per page load', async () => {
    const { reporter, httpMock } = setup({ maxPerPage: 3 });
    for (let i = 0; i < 10; i++) {
      reporter.report({ message: `error ${i}` });
    }
    expect(await reports(httpMock)).toHaveLength(3);
  });

  it('does nothing when disabled', async () => {
    const { reporter, httpMock } = setup({ enabled: false });
    reporter.report({ message: 'quiet' });
    expect(await reports(httpMock)).toHaveLength(0);
  });

  it('does nothing on the server', async () => {
    const { http, httpMock } = setup({ platform: 'server' });
    TestBed.inject(ErrorHandler).handleError(new Error('ssr'));
    http.get(`${API}/score/1`).subscribe({ error: () => undefined });
    httpMock.expectOne(`${API}/score/1`).flush('boom', { status: 500, statusText: 'Server Error' });
    expect(await reports(httpMock)).toHaveLength(0);
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe('sanitizeUrl', () => {
  it('removes credentials, fragment and sensitive parameters', () => {
    expect(sanitizeUrl('https://bob:pw@pianoml.org/verify?token=abc&lang=fr&Password=x&code=1#access_token=z'))
      .toBe('https://pianoml.org/verify?lang=fr');
    expect(sanitizeUrl('/api/score/1?reset_token=a&tab=pdf')).toBe('/api/score/1?tab=pdf');
  });
});
