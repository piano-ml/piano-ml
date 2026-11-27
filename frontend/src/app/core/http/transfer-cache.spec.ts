import { HttpRequest } from '@angular/common/http';
import { isTransferCacheable } from './transfer-cache';

const API = 'https://api.pianoml.org';

function get(url: string, withCredentials = true): HttpRequest<unknown> {
  return new HttpRequest('GET', url, { withCredentials });
}

function cacheable(url: string, anonymous = true, apiBase = API): boolean {
  return isTransferCacheable(get(url), apiBase, anonymous);
}

describe('isTransferCacheable', () => {
  it('hands the public API calls of the score and library pages to the browser, logged in or not', () => {
    for (const anonymous of [true, false]) {
      expect(cacheable(`${API}/score/azali-chaos-construct`, anonymous)).toBe(true);
      expect(cacheable(`${API}/score/azali-chaos-construct?lang=fr`, anonymous)).toBe(true);
      expect(cacheable(`${API}/score/0b6e5c1e/video`, anonymous)).toBe(true);
      expect(cacheable(`${API}/score/stats`, anonymous)).toBe(true);
      expect(cacheable(`${API}/score/getFullKey`, anonymous)).toBe(true);
    }
  });

  it('hands the library lists over to anonymous visitors only (they hold a user\'s private scores)', () => {
    expect(cacheable(`${API}/score/search?genreSlug=folk&limit=100`)).toBe(true);
    expect(cacheable(`${API}/score/genre/browse?offset=0`)).toBe(true);
    expect(cacheable(`${API}/score/author/browse`)).toBe(true);
    expect(cacheable(`${API}/score/search?genreSlug=folk`, false)).toBe(false);
    expect(cacheable(`${API}/score/genre/browse`, false)).toBe(false);
  });

  it('works with a relative API base (dev server)', () => {
    expect(cacheable('/api/score/azali-chaos-construct', true, '/api')).toBe(true);
  });

  it('never caches the other API calls (they may depend on the user)', () => {
    expect(cacheable(`${API}/account/userinfo`)).toBe(false);
    expect(cacheable(`${API}/account/playlist/favorites/ids`)).toBe(false);
    expect(cacheable(`${API}/score/0b6e5c1e/info`)).toBe(false);
    expect(cacheable(`${API}/genre`)).toBe(false);
  });

  it('does not take another host for the API', () => {
    expect(cacheable('https://api.pianoml.org.evil.test/score/x')).toBe(false);
  });

  it('caches nothing outside the API (no-store would no longer be honoured for it)', () => {
    expect(isTransferCacheable(get('/assets/version.json', false), API, true)).toBe(false);
  });
});
