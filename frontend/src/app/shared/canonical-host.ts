/**
 * The site has one address, https://pianoml.org (SITE_ORIGIN). www.pianoml.org also reaches it, but the browser
 * keeps a separate storage per address: the timing calibration, the tours seen and the preferences made on one
 * would be missing on the other. Hence a permanent redirect to the same path on pianoml.org.
 */
export const CANONICAL_HOST = 'pianoml.org';
const ALIASES = new Set(['www.pianoml.org']);

/**
 * Where a request must go instead, or null to serve it: `host` is the Host (or X-Forwarded-Host) header, `url`
 * the path with its query string.
 */
export function canonicalRedirect(host: string | undefined, url: string): string | null {
  const name = (host ?? '').split(',')[0].trim().toLowerCase().replace(/:\d+$/, '');
  if (!ALIASES.has(name)) {
    return null;
  }
  const path = url.startsWith('/') && !url.startsWith('//') ? url : '/';
  return `https://${CANONICAL_HOST}${path}`;
}
