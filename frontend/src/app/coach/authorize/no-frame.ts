/**
 * Pages that must never be shown inside a frame (clickjacking): the OAuth consent page, in any language
 * (`/coach/authorize`, `/fr/coach/authorize`, `/zh-Hans/coach/authorize`). The SSR server sends
 * `Content-Security-Policy: frame-ancestors 'none'` and `X-Frame-Options: DENY` for them (src/server.ts).
 */
export const NO_FRAME_PATH = /^(\/[a-z]{2}(-[A-Za-z]+)?)?\/coach\/authorize\/?$/;

export const NO_FRAME_HEADERS: Readonly<Record<string, string>> = {
  'Content-Security-Policy': "frame-ancestors 'none'",
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
};

export function isNoFramePath(path: string): boolean {
  return NO_FRAME_PATH.test(path);
}
