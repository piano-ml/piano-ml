import { SITE_ORIGIN, localizedUrl } from '../i18n';

/**
 * Site-wide constants used to build every page's metadata. `url` is the bare origin: a page URL goes
 * through `localizedUrl()` so it carries the current language's prefix. The Open Graph locale comes
 * from the current locale (`currentLocaleInfo().ogLocale`).
 */
export const SITE = {
  url: SITE_ORIGIN,
  name: 'PianoML',
  titleSuffix: ' | PianoML',
  ogImage: '/assets/images/pianoml-og-image.png',
  // $localize: each language's build carries its own text.
  defaultTitle: $localize`:@@seo.defaultTitle:PianoML: Learn Piano with Smart Sheet Music & Practice Tools`,
  defaultDescription: $localize`:@@seo.defaultDescription:Learn piano with PianoML, a free and open-source web app for MusicXML, MIDI and PDF sheet music. Practice scales, get real-time feedback and build your own score library.`
} as const;

/**
 * Everything a page can say about itself. Supplied either declaratively through
 * the route's `data.seo`, or imperatively through `SeoService.update()` once a
 * page has loaded the data it needs to describe itself.
 */
export interface SeoData {
  title?: string;
  description?: string;
  /** Absolute URL, or a path that gets resolved against {@link SITE.url}. */
  image?: string;
  /** `og:type` — defaults to `website`. */
  type?: string;
  /**
   * Absolute URL, or an app path (without language prefix) resolved in the current language.
   * Defaults to the current route without its query.
   */
  canonical?: string;
  /** A single JSON-LD object or several of them. */
  // biome-ignore lint/suspicious/noExplicitAny: JSON-LD is free-form by nature
  structuredData?: any | any[];
  /** Keeps the page out of the index — mirror of robots.txt for in-app routes. */
  noindex?: boolean;
}

/** The maximum length Google renders before truncating a description. */
const DESCRIPTION_MAX = 160;

/**
 * Longest a title may be before the site suffix is dropped. Search results cut
 * titles around 60 characters, and the piece and composer matter more there
 * than the brand — score titles alone can run past that on their own.
 */
const TITLE_BUDGET = 55;

/**
 * Appends the site suffix unless the title already names the site, so page
 * titles stay consistent without ending up as "… | PianoML | PianoML", and
 * unless the title is long enough that the suffix would only be truncated.
 */
export function pageTitle(title?: string): string {
  const base = (title || '').trim();
  if (!base) return SITE.defaultTitle;

  const namesSite = base.toLowerCase().includes(SITE.name.toLowerCase());
  return namesSite || base.length > TITLE_BUDGET ? base : base + SITE.titleSuffix;
}

/**
 * Collapses whitespace and trims to a length search engines actually display,
 * cutting on a word boundary rather than mid-word.
 */
export function clampDescription(description?: string, max: number = DESCRIPTION_MAX): string {
  const text = (description || '').replace(/\s+/g, ' ').trim();
  if (text.length <= max) return text;

  const cut = text.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).replace(/[,;:.\s]+$/, '')}…`;
}

/** Resolves a path against the site origin; absolute URLs are passed through. */
export function absoluteUrl(pathOrUrl: string): string {
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  return `${SITE.url}/${pathOrUrl.replace(/^\/+/, '')}`;
}

/**
 * {@link localizedUrl} for JSON-LD: the English site root stays `https://pianoml.org` without a
 * trailing slash, as it always was; every other URL, `/es/` included, is the page's own URL.
 */
export function siteUrl(path: string, locale?: string): string {
  const url = localizedUrl(path, locale);
  return url === `${SITE.url}/` ? SITE.url : url;
}

/** Drops the query string and fragment — those never belong in a canonical. */
export function canonicalPath(url: string): string {
  return url.split(/[?#]/)[0] || '/';
}
