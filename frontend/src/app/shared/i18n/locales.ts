/**
 * The languages the app is built in, with no dependency beyond the generated list: server.ts uses them
 * too, outside Angular and without the `$localize` runtime.
 */
import type { LocaleInfo } from './locale-info';
import { LOCALES } from './locales.generated';

export { LOCALES };

/** Every language the app is built in, source locale first (generated from angular.json). */
export function availableLocales(): readonly LocaleInfo[] {
  return LOCALES;
}

/** The language the source is written in, served at the root and used for `x-default`. */
export function sourceLocale(): LocaleInfo {
  return LOCALES[0];
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
