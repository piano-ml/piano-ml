import { loginQueryParams, safeReturnUrl } from './return-url';

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
});
