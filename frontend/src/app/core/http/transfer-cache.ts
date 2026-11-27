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
  /^\/score\/[^/]+$/, // a score by its slug (score page)
  /^\/score\/[^/]+\/video$/, // the score's video lessons
  // Not /genre: 350 KB in every page's HTML would cost more load time than its one text cell shifts
];

/** The transfer cache filter: only the API calls PUBLIC_API_PATHS lists. */
export function isTransferCacheable(request: HttpRequest<unknown>, apiBase: string): boolean {
  const path = apiPath(request.urlWithParams, apiBase);
  return path !== null && PUBLIC_API_PATHS.some(pattern => pattern.test(path));
}

/** The path of an API URL after the API base ("https://api.pianoml.org" or "/api"), without its query; else null. */
function apiPath(url: string, apiBase: string): string | null {
  if (!url.startsWith(apiBase + '/')) {
    return null;
  }
  return url.slice(apiBase.length).split('?')[0];
}
