import { LOCALE_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  availableLocales,
  currentLocale,
  currentLocaleInfo,
  localeInfo,
  localizedPath,
  localizedUrl,
  provideI18n,
  setCurrentLocale,
  sourceLocale,
  splitLocalePath
} from './i18n';

/** The languages come from angular.json (generated), English at the root and Spanish under /es/. */
describe('i18n helpers', () => {
  afterEach(() => setCurrentLocale(undefined));

  it('lists every built language, source first, with its prefix and og:locale', () => {
    expect(availableLocales().slice(0, 2)).toEqual([
      { code: 'en', subPath: '', ogLocale: 'en_US' },
      { code: 'es', subPath: 'es', ogLocale: 'es_ES' }
    ]);
    expect(sourceLocale().code).toBe('en');
  });

  it('matches a tag by exact code, then by language, else the source locale', () => {
    expect(localeInfo('es').code).toBe('es');
    expect(localeInfo('ES').code).toBe('es');
    expect(localeInfo('es-MX').code).toBe('es');
    expect(localeInfo('en-US').code).toBe('en');
    expect(localeInfo('xx').code).toBe('en');
    expect(localeInfo(undefined).code).toBe('en');
  });

  it('is English when nothing set the locale (unit tests run in English)', () => {
    expect(currentLocale()).toBe('en');
  });

  it("takes the current locale from the build's LOCALE_ID", () => {
    TestBed.configureTestingModule({ providers: [{ provide: LOCALE_ID, useValue: 'es' }, provideI18n()] });
    TestBed.inject(LOCALE_ID); // runs the environment initializers
    expect(currentLocale()).toBe('es');
    expect(currentLocaleInfo().ogLocale).toBe('es_ES');
  });

  it('prefixes app paths for every language but the source one', () => {
    expect(localizedPath('/library/artists', 'en')).toBe('/library/artists');
    expect(localizedPath('/library/artists', 'es')).toBe('/es/library/artists');
    expect(localizedPath('/', 'es')).toBe('/es/');
    expect(localizedPath('score/x', 'es')).toBe('/es/score/x');
  });

  it('builds absolute URLs in the current language by default', () => {
    expect(localizedUrl('/score/clair-de-lune')).toBe('https://pianoml.org/score/clair-de-lune');
    expect(localizedUrl('/')).toBe('https://pianoml.org/');
    setCurrentLocale('es');
    expect(localizedUrl('/score/clair-de-lune')).toBe('https://pianoml.org/es/score/clair-de-lune');
    expect(localizedUrl('/')).toBe('https://pianoml.org/es/');
    expect(localizedUrl('/library', 'en')).toBe('https://pianoml.org/library');
  });

  it('passes absolute URLs through', () => {
    setCurrentLocale('es');
    expect(localizedUrl('https://example.org/x')).toBe('https://example.org/x');
  });

  it('splits a site path into its language and the path the app routes on', () => {
    expect(splitLocalePath('/es/library')).toEqual({ locale: localeInfo('es'), path: '/library' });
    expect(splitLocalePath('/es/')).toEqual({ locale: localeInfo('es'), path: '/' });
    expect(splitLocalePath('/es')).toEqual({ locale: localeInfo('es'), path: '/' });
    expect(splitLocalePath('/library')).toEqual({ locale: localeInfo('en'), path: '/library' });
    // A path that merely starts with the same letters is not under the prefix.
    expect(splitLocalePath('/essays')).toEqual({ locale: localeInfo('en'), path: '/essays' });
  });
});
