import { type EnvironmentProviders, LOCALE_ID, inject, makeEnvironmentProviders, provideEnvironmentInitializer } from '@angular/core';
import type { LocaleInfo } from './locale-info';
import { LOCALES } from './locales.generated';

/** The site origin every absolute URL is built from. */
export const SITE_ORIGIN = 'https://pianoml.org';

/** Every language the app is built in, source locale first (generated from angular.json). */
export function availableLocales(): readonly LocaleInfo[] {
  return LOCALES;
}

/** The language the source is written in, served at the root and used for `x-default`. */
export function sourceLocale(): LocaleInfo {
  return LOCALES[0];
}

/**
 * Set once per bundle by {@link provideI18n}. Each localized build is a separate bundle (and a separate
 * module instance on the server), so this never mixes languages. It is not read from the global
 * `$localize.locale`, which every locale's server bundle overwrites in the one Node process.
 */
let active: LocaleInfo | undefined;

/** The locale of the running build: `en`, `es`. */
export function currentLocale(): string {
  return currentLocaleInfo().code;
}

export function currentLocaleInfo(): LocaleInfo {
  if (active) return active;
  // Before the app initialised (module-level code): in the browser only one bundle ever runs.
  const global = typeof $localize !== 'undefined' ? $localize.locale : undefined;
  return localeInfo(global);
}

/**
 * The known locale matching a BCP 47 tag, by exact code first and then by language (`en-US` → `en`);
 * the source locale for anything else.
 */
export function localeInfo(tag: string | undefined | null): LocaleInfo {
  if (!tag) return sourceLocale();
  const wanted = tag.toLowerCase();
  const language = wanted.split('-')[0];

  return (
    LOCALES.find(locale => locale.code.toLowerCase() === wanted) ??
    LOCALES.find(locale => locale.code.toLowerCase().split('-')[0] === language) ??
    sourceLocale()
  );
}

/** Sets the current locale; `undefined` resets it. Called by {@link provideI18n}, and by tests. */
export function setCurrentLocale(tag: string | undefined): void {
  active = tag === undefined ? undefined : localeInfo(tag);
}

/** Records the build's `LOCALE_ID` (per request on the server) as the current locale. */
export function provideI18n(): EnvironmentProviders {
  return makeEnvironmentProviders([provideEnvironmentInitializer(() => setCurrentLocale(inject(LOCALE_ID)))]);
}

/**
 * Splits a site path into its locale and the path the app routes on: `/es/library` → (`es`,
 * `/library`), `/library` → (source, `/library`). Route segments are never translated, so the rest of
 * the path is the same in every language.
 */
export function splitLocalePath(pathname: string): { locale: LocaleInfo; path: string } {
  const clean = pathname.startsWith('/') ? pathname : `/${pathname}`;

  for (const locale of LOCALES) {
    if (!locale.subPath) continue;
    const prefix = `/${locale.subPath}`;
    if (clean === prefix || clean.startsWith(`${prefix}/`)) {
      return { locale, path: clean.slice(prefix.length) || '/' };
    }
  }

  return { locale: sourceLocale(), path: clean };
}

/** An app path under a locale's prefix: `/library` → `/es/library`, `/` → `/es/`. */
export function localizedPath(path: string, locale: string = currentLocale()): string {
  const clean = path.startsWith('/') ? path : `/${path}`;
  const { subPath } = localeInfo(locale);
  return subPath ? `/${subPath}${clean}` : clean;
}

/**
 * The absolute URL of an app path in a language, the current one by default:
 * `localizedUrl('/library', 'es')` → `https://pianoml.org/es/library`. The one helper every site URL
 * (canonical, JSON-LD, shared links) goes through. Absolute URLs are returned unchanged.
 */
export function localizedUrl(path: string, locale: string = currentLocale()): string {
  if (/^https?:\/\//i.test(path)) return path;
  return `${SITE_ORIGIN}${localizedPath(path, locale)}`;
}
