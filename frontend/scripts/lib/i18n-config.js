/**
 * Reads the list of languages from the `i18n` section of angular.json, the single source of truth for
 * every generator (locales list, robots.txt, web manifests, sitemap). No other file lists languages.
 */
const fs = require('fs');
const path = require('path');

const ANGULAR_JSON = path.join(__dirname, '..', '..', 'angular.json');
const PROJECT = 'piano-ml';

/**
 * The Open Graph locale (`en_US`, `es_ES`) for a BCP 47 code: the code's own region when it has one,
 * otherwise the most likely region for the language (CLDR likely subtags, through Intl).
 */
function ogLocaleOf(code) {
  const locale = new Intl.Locale(code).maximize();
  return locale.region ? `${locale.language}_${locale.region}` : locale.language;
}

/** A locale entry is either the translation file path or an object; `subPath` defaults to the code. */
function normalize(code, entry, fallbackSubPath = code) {
  const config = typeof entry === 'string' ? { translation: entry } : { ...(entry || {}) };
  const subPath = config.subPath ?? fallbackSubPath;
  const translation = Array.isArray(config.translation) ? config.translation[0] : config.translation;

  return { code, subPath, translation: translation || null, ogLocale: ogLocaleOf(code) };
}

/**
 * Every language, source locale first: `{ code, subPath, translation, ogLocale }`. `subPath` is the URL
 * prefix without slashes (`''` for the source locale served at the root). `translation` is relative to
 * the angular.json directory, and null for the source locale.
 *
 * @param {object} angularJson parsed angular.json
 */
function localesFromAngularJson(angularJson, project = PROJECT) {
  const i18n = angularJson?.projects?.[project]?.i18n;
  if (!i18n) throw new Error(`angular.json has no i18n section for project "${project}"`);

  const source = typeof i18n.sourceLocale === 'string' ? { code: i18n.sourceLocale } : i18n.sourceLocale || { code: 'en-US' };
  const locales = [normalize(source.code, { subPath: source.subPath })];

  for (const [code, entry] of Object.entries(i18n.locales || {})) {
    if (code === source.code) continue;
    locales.push(normalize(code, entry));
  }

  const seen = new Set();
  for (const { code, subPath } of locales) {
    if (seen.has(subPath)) throw new Error(`Two locales share the URL prefix "/${subPath}" (${code})`);
    seen.add(subPath);
  }

  return locales;
}

/** Reads angular.json from disk (or the given path) and returns its locales. */
function readLocales(angularJsonPath = ANGULAR_JSON) {
  return localesFromAngularJson(JSON.parse(fs.readFileSync(angularJsonPath, 'utf8')));
}

/** `path` (starting with `/`) under a locale's prefix: `/library` → `/es/library`, `/` → `/es/`. */
function localizedPath(pathname, locale) {
  const clean = pathname.startsWith('/') ? pathname : `/${pathname}`;
  return locale.subPath ? `/${locale.subPath}${clean}` : clean;
}

module.exports = { ANGULAR_JSON, localesFromAngularJson, readLocales, localizedPath, ogLocaleOf };
