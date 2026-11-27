import { HttpRequest } from '@angular/common/http';
import { isTransferCacheable } from './transfer-cache';

const API = 'https://api.pianoml.org';

function get(url: string, withCredentials = true): HttpRequest<unknown> {
  return new HttpRequest('GET', url, { withCredentials });
}

describe('isTransferCacheable', () => {
  it('hands the public API calls of the score page to the browser', () => {
    expect(isTransferCacheable(get(`${API}/score/azali-chaos-construct`), API)).toBe(true);
    expect(isTransferCacheable(get(`${API}/score/0b6e5c1e/video`), API)).toBe(true);
    expect(isTransferCacheable(get(`${API}/score/azali-chaos-construct?lang=fr`), API)).toBe(true);
  });

  it('works with a relative API base (dev server)', () => {
    expect(isTransferCacheable(get('/api/score/azali-chaos-construct'), '/api')).toBe(true);
  });

  it('never caches the other API calls made with credentials (they may depend on the user)', () => {
    expect(isTransferCacheable(get(`${API}/user/me`), API)).toBe(false);
    expect(isTransferCacheable(get(`${API}/score/genre/browse`), API)).toBe(false);
    expect(isTransferCacheable(get(`${API}/score/0b6e5c1e/info`), API)).toBe(false);
    expect(isTransferCacheable(get(`${API}/genre`), API)).toBe(false);
  });

  it('does not take another host for the API', () => {
    expect(isTransferCacheable(get('https://api.pianoml.org.evil.test/score/x'), API)).toBe(false);
  });

  it('caches nothing outside the API (no-store would no longer be honoured for it)', () => {
    expect(isTransferCacheable(get('/assets/version.json', false), API)).toBe(false);
  });
});
