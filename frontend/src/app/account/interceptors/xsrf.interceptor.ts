import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { HttpInterceptorFn } from '@angular/common/http';
import { inject, InjectionToken, PLATFORM_ID } from '@angular/core';
import { environment } from '../../../environments/environment';

export const XSRF_COOKIE_NAME = 'XSRF-TOKEN';
export const XSRF_HEADER_NAME = 'X-XSRF-TOKEN';

/** Base URL of the backend API; requests elsewhere never get the token. */
export const XSRF_API_BASE = new InjectionToken<string>('XSRF_API_BASE', {
  factory: () => environment.api,
});

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS', 'TRACE']);

export function readCookie(cookieString: string, name: string): string | null {
  for (const part of cookieString.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) {
      return decodeURIComponent(rest.join('='));
    }
  }
  return null;
}

/**
 * Double-submit CSRF token for the backend (Spring Security SPA mode).
 *
 * The backend sets a JS-readable XSRF-TOKEN cookie (Domain=.pianoml.org in production, so pianoml.org can
 * read a cookie issued by api.pianoml.org) and requires its value in X-XSRF-TOKEN on state-changing requests.
 * Angular's built-in XSRF support only handles relative URLs, and production calls the absolute
 * https://api.pianoml.org, hence this interceptor (built-in support is disabled in app.config.ts).
 */
export const xsrfInterceptor: HttpInterceptorFn = (req, next) => {
  if (SAFE_METHODS.has(req.method.toUpperCase()) || req.headers.has(XSRF_HEADER_NAME)) {
    return next(req);
  }
  if (!isPlatformBrowser(inject(PLATFORM_ID))) {
    return next(req);
  }
  if (!req.url.startsWith(inject(XSRF_API_BASE))) {
    return next(req);
  }
  const token = readCookie(inject(DOCUMENT).cookie ?? '', XSRF_COOKIE_NAME);
  return next(token ? req.clone({ setHeaders: { [XSRF_HEADER_NAME]: token } }) : req);
};
