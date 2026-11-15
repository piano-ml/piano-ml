import { bestAcceptedLocale, homeRedirect, langCookie, localeFromCookie, parseAcceptLanguage } from './locale-negotiation';

/** The language choice: the switcher's cookie, then Accept-Language, and only ever on `/`. */
describe('locale negotiation', () => {
  describe('the / redirect', () => {
    it('follows the lang cookie first', () => {
      expect(homeRedirect('lang=es', 'en-US,en;q=0.9')).toBe('/es/');
      expect(homeRedirect('theme=dark; lang=en', 'es-ES,es;q=0.9')).toBeNull(); // English is / itself
    });

    it('then the best Accept-Language match', () => {
      expect(homeRedirect(undefined, 'es-ES,es;q=0.9,en;q=0.8')).toBe('/es/');
      expect(homeRedirect('', 'ja-JP,ja;q=0.9,es;q=0.5,en;q=0.4')).toBe('/es/');
      expect(homeRedirect('', 'fr-CA,fr;q=0.9,en;q=0.8')).toBe('/fr/');
      expect(homeRedirect('lang=fr', 'es')).toBe('/fr/');
      expect(homeRedirect('', 'it-IT,it;q=0.9,en;q=0.8')).toBe('/it/');
      // Chinese is built as Simplified Chinese (zh-Hans) under /zh/: zh-CN and plain zh land there.
      expect(homeRedirect('', 'zh-CN,zh;q=0.9')).toBe('/zh/');
      expect(homeRedirect('', 'zh')).toBe('/zh/');
      expect(homeRedirect('lang=zh-Hans', undefined)).toBe('/zh/');
      expect(homeRedirect('', 'en-GB,es;q=0.8')).toBeNull();
    });

    it('serves English when nothing matches, or when the client says nothing (crawlers)', () => {
      expect(homeRedirect(undefined, 'ja-JP,ko;q=0.8')).toBeNull();
      expect(homeRedirect(undefined, undefined)).toBeNull();
      expect(homeRedirect(undefined, '*')).toBeNull();
    });

    it('ignores a cookie naming a language the site is not built in', () => {
      expect(homeRedirect('lang=klingon', 'es')).toBe('/es/');
      expect(homeRedirect('lang=klingon', undefined)).toBeNull();
    });

    it('keeps the query string', () => {
      expect(homeRedirect('lang=es', undefined, '?utm_source=x')).toBe('/es/?utm_source=x');
    });
  });

  it('orders Accept-Language by quality, then by position, dropping q=0', () => {
    expect(parseAcceptLanguage('fr;q=0.5, es, en;q=0.8, de;q=0')).toEqual(['es', 'en', 'fr']);
    expect(parseAcceptLanguage('')).toEqual([]);
  });

  it('matches a regional tag to its language', () => {
    expect(bestAcceptedLocale('es-MX')?.code).toBe('es');
    expect(bestAcceptedLocale('EN-us')?.code).toBe('en');
    expect(bestAcceptedLocale('ja')).toBeUndefined();
  });

  it('reads the lang cookie among others', () => {
    expect(localeFromCookie('a=1; lang=es; b=2')?.code).toBe('es');
    expect(localeFromCookie('language=es')).toBeUndefined();
    expect(localeFromCookie(undefined)).toBeUndefined();
  });

  it('stores the choice for a year, on the whole site', () => {
    expect(langCookie('es')).toBe('lang=es; Path=/; Max-Age=31536000; SameSite=Lax');
  });
});
