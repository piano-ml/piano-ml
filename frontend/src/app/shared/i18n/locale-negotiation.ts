import { availableLocales, sourceLocale } from './locales';
import type { LocaleInfo } from './locale-info';

/** The cookie the language switcher stores: the code of the language last chosen. */
export const LANG_COOKIE = 'lang';

/** One year: the choice outlives the session. */
const LANG_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/** The `Set-Cookie` / `document.cookie` value recording a language choice, for the whole site. */
export function langCookie(code: string): string {
  return `${LANG_COOKIE}=${encodeURIComponent(code)}; Path=/; Max-Age=${LANG_COOKIE_MAX_AGE}; SameSite=Lax`;
}

/** The language stored in a `Cookie` header, when it is one the site is built in. */
export function localeFromCookie(cookieHeader: string | null | undefined): LocaleInfo | undefined {
  for (const part of (cookieHeader || '').split(';')) {
    const [name, ...value] = part.trim().split('=');
    if (name !== LANG_COOKIE) continue;
    const code = safeDecode(value.join('=')).toLowerCase();
    return availableLocales().find(locale => locale.code.toLowerCase() === code);
  }
  return undefined;
}

/** The language tags of an `Accept-Language` header, most wanted first; `q=0` and `*` left out. */
export function parseAcceptLanguage(header: string | null | undefined): string[] {
  return (header || '')
    .split(',')
    .map((item, index) => {
      const [tag, ...params] = item.trim().split(';');
      const q = params.map(p => p.trim()).find(p => p.startsWith('q='));
      const quality = q ? Number(q.slice(2)) : 1;
      return { tag: tag.trim(), quality: Number.isFinite(quality) ? quality : 0, index };
    })
    .filter(({ tag, quality }) => tag && tag !== '*' && quality > 0)
    .sort((a, b) => b.quality - a.quality || a.index - b.index)
    .map(({ tag }) => tag);
}

/**
 * The built language that best matches an `Accept-Language` header: the first wanted tag matching a
 * language exactly, or else by its primary language (`es-MX` → `es`); undefined when none matches.
 */
export function bestAcceptedLocale(header: string | null | undefined): LocaleInfo | undefined {
  const locales = availableLocales();
  for (const tag of parseAcceptLanguage(header)) {
    const wanted = tag.toLowerCase();
    const language = wanted.split('-')[0];
    const match =
      locales.find(locale => locale.code.toLowerCase() === wanted) ??
      locales.find(locale => locale.code.toLowerCase().split('-')[0] === language);
    if (match) return match;
  }
  return undefined;
}

/** The headers a response to `/` varies on, since its language does. */
export const HOME_VARY = 'Accept-Language, Cookie';

/**
 * Where a request for the site root `/` goes: the language in the cookie, else the best
 * `Accept-Language` match, else the source language. Returns the path to redirect to (302), keeping the
 * query string, or null to serve `/` itself. Only `/` is ever redirected: deep links never are.
 */
export function homeRedirect(cookieHeader: string | null | undefined, acceptLanguage: string | null | undefined, search = ''): string | null {
  const locale = localeFromCookie(cookieHeader) ?? bestAcceptedLocale(acceptLanguage) ?? sourceLocale();
  if (!locale.subPath) return null;
  return `/${locale.subPath}/${search}`;
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
