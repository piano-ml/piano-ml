import { isNoFramePath } from './no-frame';

describe('isNoFramePath', () => {
  it('matches the consent page in every language', () => {
    for (const path of ['/coach/authorize', '/coach/authorize/', '/fr/coach/authorize', '/zh-Hans/coach/authorize']) {
      expect(isNoFramePath(path), path).toBe(true);
    }
  });

  it('matches nothing else', () => {
    for (const path of ['/coach/connect', '/coach/authorize/x', '/library', '/x/y/coach/authorize', '/']) {
      expect(isNoFramePath(path), path).toBe(false);
    }
  });
});
