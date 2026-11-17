import type { Params } from '@angular/router';

/** Query parameter carrying the page to come back to after logging in. */
export const RETURN_URL_PARAM = 'returnUrl';

export const LOGIN_PATH = '/account/login';

/** Pages it makes no sense to come back to after logging in. */
const NO_RETURN_PATHS = [LOGIN_PATH, '/account/create'];

/**
 * Pages that need a session: when it has expired there, the user is sent to login.
 * Everywhere else they stay on the page, logged out.
 */
const PROTECTED_PATHS = ['/account/home', '/account/scores', '/account/score/edit', '/import/import-work', '/coach/connect', '/coach/authorize'];

const pathOf = (url: string) => url.split(/[?#]/)[0];

/** Whether `url` is (under) a protected page; matches whole path segments only. */
export function requiresLogin(url: string): boolean {
  const path = pathOf(url);
  return PROTECTED_PATHS.some(p => path === p || path.startsWith(`${p}/`));
}

/**
 * Query params for a link or redirect to the login page that remembers `currentUrl`
 * (usually `router.url`), so login can bring the user back there.
 */
export function loginQueryParams(currentUrl: string): Params {
  return safeReturnUrl(currentUrl) === '/' ? {} : { [RETURN_URL_PARAM]: currentUrl };
}

/**
 * Validates a return URL read from the query string: only same-site paths are accepted
 * ("/library", not "https://evil.example" or "//evil.example"), so a crafted login link
 * can't send the user to another site after they sign in. Falls back to "/".
 */
export function safeReturnUrl(raw: string | null | undefined): string {
  // biome-ignore lint/suspicious/noControlCharactersInRegex: rejecting control characters is the point
  if (!raw || !raw.startsWith('/') || raw.startsWith('//') || raw.includes('\\') || /[\u0000-\u001f\u007f]/.test(raw)) {
    return '/';
  }
  return NO_RETURN_PATHS.includes(pathOf(raw)) ? '/' : raw;
}
