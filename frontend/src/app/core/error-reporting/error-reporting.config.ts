import { HttpContextToken } from '@angular/common/http';
import { InjectionToken } from '@angular/core';
import { environment } from '../../../environments/environment';

/** Error reporting (issue #409): off in local dev and unit tests, on in production builds. */
export interface ErrorReportingConfig {
  enabled: boolean;
  /** Reports sent per page load at most */
  maxPerPage: number;
  /** An identical report within this delay is dropped */
  dedupMs: number;
}

export const ERROR_REPORTING_CONFIG = new InjectionToken<ErrorReportingConfig>('ERROR_REPORTING_CONFIG', {
  factory: () => ({ enabled: environment.errorReporting, maxPerPage: 20, dedupMs: 10_000 }),
});

/** Set on requests whose failure must not be reported: the reports themselves, the admin error pages. */
export const SKIP_ERROR_REPORT = new HttpContextToken<boolean>(() => false);

/** Query parameter names removed from reported URLs, whatever their case (the backend scrubs them too). */
const SENSITIVE_PARAMS = new Set(['code', 'key', 'sig', 'otp', 'pwd', 'jwt', 'state', 'email']);
const SENSITIVE_FRAGMENTS = ['token', 'password', 'passwd', 'secret', 'auth', 'session', 'signature', 'apikey', 'api_key', 'credential'];

export function isSensitiveParam(name: string): boolean {
  const lower = name.toLowerCase();
  return SENSITIVE_PARAMS.has(lower) || SENSITIVE_FRAGMENTS.some(f => lower.includes(f));
}

/** The URL without credentials, fragment and sensitive query parameters. Never throws. */
export function sanitizeUrl(url: string): string {
  try {
    const parsed = new URL(url, 'http://relative.invalid');
    parsed.username = '';
    parsed.password = '';
    parsed.hash = '';
    for (const name of [...parsed.searchParams.keys()]) {
      if (isSensitiveParam(name)) {
        parsed.searchParams.delete(name);
      }
    }
    const result = parsed.toString();
    return parsed.origin === 'http://relative.invalid' ? result.substring('http://relative.invalid'.length) : result;
  } catch {
    return url.split(/[?#]/)[0];
  }
}
