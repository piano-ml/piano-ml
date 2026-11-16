import { loginQueryParams, requiresLogin, safeReturnUrl } from './return-url';

describe('return-url', () => {
  describe('safeReturnUrl', () => {
    it('keeps same-site paths, with their query string and fragment', () => {
      expect(safeReturnUrl('/library')).toBe('/library');
      expect(safeReturnUrl('/score/hanon-no-19?tab=info#videos')).toBe('/score/hanon-no-19?tab=info#videos');
    });

    it('falls back to "/" when there is nothing to return to', () => {
      expect(safeReturnUrl(null)).toBe('/');
      expect(safeReturnUrl(undefined)).toBe('/');
      expect(safeReturnUrl('')).toBe('/');
    });

    it.each([
      'https://evil.example',
      '//evil.example',
      '/\\evil.example',
      '/\t/evil.example',
      'javascript:alert(1)',
      'library',
    ])('rejects %j, which could leave the site', (url) => {
      expect(safeReturnUrl(url)).toBe('/');
    });

    it('does not return to the login or create-account pages', () => {
      expect(safeReturnUrl('/account/login')).toBe('/');
      expect(safeReturnUrl('/account/login?returnUrl=%2Flibrary')).toBe('/');
      expect(safeReturnUrl('/account/create')).toBe('/');
    });
  });

  describe('loginQueryParams', () => {
    it('remembers the current page', () => {
      expect(loginQueryParams('/library/artists')).toEqual({ returnUrl: '/library/artists' });
    });

    it('adds nothing for the homepage or the login page itself', () => {
      expect(loginQueryParams('/')).toEqual({});
      expect(loginQueryParams('/account/login')).toEqual({});
    });
  });

  describe('requiresLogin', () => {
    it.each([
      '/account/home',
      '/account/scores',
      '/account/scores?page=2',
      '/account/score/edit/42',
      '/coach/connect',
      '/import/import-work/abc#top',
    ])('is true for protected page %s', url => {
      expect(requiresLogin(url)).toBe(true);
    });

    it.each([
      '/',
      '/library',
      '/score/hanon-no-19',
      '/import/link',
      '/account/login',
      '/account/create',
      '/account/homes',
      '/account/scoresheet',
    ])('is false for public page %s', url => {
      expect(requiresLogin(url)).toBe(false);
    });
  });
});
