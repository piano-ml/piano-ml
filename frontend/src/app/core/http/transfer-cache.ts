import type { HttpRequest } from '@angular/common/http';

/**
 * The API calls whose server-side response is handed to the browser (Angular's HTTP transfer cache), as paths
 * after the API base. Every API call is sent with credentials (provideApi), which Angular never caches by default:
 * the browser fetched the score again after hydration, the page fell back to "Loading score…" and then grew back,
 * a large layout shift (CLS) on every score page.
 * <p>
 * The API also answers "Cache-Control: no-store" and sets the XSRF cookie on every response, which Angular would
 * skip too: app.config.ts sets includeNonCacheableRequests, so this filter alone decides. Only the body, status and
 * a few headers reach the page, never the cookie.
 * <p>
 * Only public data, the same for every visitor: the server renders without the visitor's cookies, so a response
 * that depends on the user (session, favorites, "me") must never be listed here. One entry per endpoint.
 */
const PUBLIC_API_PATHS: readonly RegExp[] = [
  /^\/score\/(?!search$)[^/]+$/, // a score by its slug (score page); not /score/search, which shares the shape
  /^\/score\/[^/]+\/video$/, // the score's video lessons
  /^\/score\/(stats|getFullKey)$/, // library counters and key filter
  // Not /genre: 350 KB in every page's HTML would cost more load time than its one text cell shifts
];

/**
 * Library lists that include the user's own private scores once logged in: the server's anonymous copy is reused
 * by anonymous visitors only (Googlebot, most visitors); a logged-in user fetches them again.
 */
const ANONYMOUS_API_PATHS: readonly RegExp[] = [
  /^\/score\/search$/,
  /^\/score\/(genre|author)\/browse$/,
];

/**
 * The transfer cache filter: the API calls PUBLIC_API_PATHS lists, and ANONYMOUS_API_PATHS for an anonymous
 * visitor (always on the server, which renders without the visitor's cookies).
 */
export function isTransferCacheable(request: HttpRequest<unknown>, apiBase: string, anonymous: boolean): boolean {
  const path = apiPath(request.urlWithParams, apiBase);
  if (path === null) {
    return false;
  }
  const matches = (pattern: RegExp) => pattern.test(path);
  return PUBLIC_API_PATHS.some(matches) || (anonymous && ANONYMOUS_API_PATHS.some(matches));
}

/** The path of an API URL after the API base ("https://api.pianoml.org" or "/api"), without its query; else null. */
function apiPath(url: string, apiBase: string): string | null {
  if (!url.startsWith(apiBase + '/')) {
    return null;
  }
  return url.slice(apiBase.length).split('?')[0];
}
