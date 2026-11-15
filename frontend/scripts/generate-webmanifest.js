#!/usr/bin/env node
/**
 * Writes one web app manifest per language (src/manifest.<code>.webmanifest, served at the site root), from
 * the i18n section of angular.json. The text is translated in one place: the English source comes from the
 * reserved `$localize` messages of src/app/shared/i18n/app-messages.ts, the translations from each
 * messages.<code>.xlf, with English as the fallback for anything not translated yet. Not committed.
 */
const fs = require('fs');
const path = require('path');
const { readLocales, localizedPath } = require('./lib/i18n-config');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'src');
const MESSAGES_FILE = path.join(SRC, 'app', 'shared', 'i18n', 'app-messages.ts');
const THEME_FILE = path.join(SRC, 'app', 'shared', 'theme', 'theme.json');
const ICONS = '/assets/images/icons';

/** The ids the manifest needs, all declared in app-messages.ts. */
const REQUIRED_IDS = ['manifest.name', 'manifest.shortName', 'manifest.description', 'nav.home', 'nav.browse', 'nav.exercises'];

const unescapeTemplate = (text) => text.replace(/\\(.)/g, '$1');

/** `{ id: text }` for every `$localize`:@@id:text`` in a source file. */
function readSourceMessages(source) {
  const messages = {};
  for (const [, id, text] of source.matchAll(/\$localize`:@@([\w.-]+):((?:[^`\\]|\\.)*)`/g)) {
    messages[id] = unescapeTemplate(text);
  }
  return messages;
}

const decodeXml = (text) =>
  text
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&amp;/g, '&');

/** `{ id: target }` for every translated unit of an XLIFF 1.2 or 2.0 file. */
function readXlfTranslations(xml) {
  const translations = {};
  const units = /<(trans-unit|unit)\b[^>]*?\bid="([^"]+)"[^>]*>([\s\S]*?)<\/\1>/g;
  for (const [, , id, body] of xml.matchAll(units)) {
    const target = body.match(/<target\b[^>]*>([\s\S]*?)<\/target>/);
    const text = target && decodeXml(target[1]).trim();
    if (text) translations[id] = text;
  }
  return translations;
}

/** The manifest of one language. `text(id)` returns the message in that language. */
function buildManifest(locale, text, theme) {
  const url = (pathname) => localizedPath(pathname, locale);

  return {
    // One app whatever the language it was installed from.
    id: '/',
    scope: '/',
    lang: locale.code,
    dir: 'ltr',
    name: text('manifest.name'),
    short_name: text('manifest.shortName'),
    description: text('manifest.description'),
    start_url: url('/'),
    display: 'standalone',
    theme_color: theme.themeColor,
    background_color: theme.backgroundColor,
    icons: [
      { src: `${ICONS}/icon-192.png`, sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: `${ICONS}/icon-512.png`, sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: `${ICONS}/icon-maskable-512.png`, sizes: '512x512', type: 'image/png', purpose: 'maskable' }
    ],
    shortcuts: [
      { name: text('nav.home'), url: url('/') },
      { name: text('nav.browse'), url: url('/library') },
      { name: text('nav.exercises'), url: url('/exercises') }
    ].map((shortcut) => ({ ...shortcut, icons: [{ src: `${ICONS}/icon-192.png`, sizes: '192x192', type: 'image/png' }] }))
  };
}

/**
 * Every language's manifest, keyed by file name. `readTranslation(file)` returns the content of a
 * translation file (relative to the project root), or null when it does not exist.
 */
function buildManifests(locales, sourceMessages, readTranslation, theme) {
  const missing = REQUIRED_IDS.filter((id) => !sourceMessages[id]);
  if (missing.length) throw new Error(`app-messages.ts does not declare: ${missing.join(', ')}`);

  const manifests = {};
  for (const locale of locales) {
    const xml = locale.translation ? readTranslation(locale.translation) : null;
    const translations = xml ? readXlfTranslations(xml) : {};
    const text = (id) => translations[id] || sourceMessages[id];
    manifests[`manifest.${locale.code}.webmanifest`] = buildManifest(locale, text, theme);
  }
  return manifests;
}

function main() {
  const locales = readLocales();
  const sourceMessages = readSourceMessages(fs.readFileSync(MESSAGES_FILE, 'utf8'));
  const theme = JSON.parse(fs.readFileSync(THEME_FILE, 'utf8'));
  const readTranslation = (file) => {
    const full = path.join(ROOT, file);
    if (fs.existsSync(full)) return fs.readFileSync(full, 'utf8');
    console.warn(`! ${file} not found: its manifest falls back to English`);
    return null;
  };

  const manifests = buildManifests(locales, sourceMessages, readTranslation, theme);

  // A language removed from angular.json leaves no stale manifest behind.
  for (const file of fs.readdirSync(SRC)) {
    if (/^manifest\..+\.webmanifest$/.test(file) && !manifests[file]) fs.unlinkSync(path.join(SRC, file));
  }
  for (const [file, manifest] of Object.entries(manifests)) {
    fs.writeFileSync(path.join(SRC, file), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
    console.log(`✓ src/${file}`);
  }
}

if (require.main === module) main();

module.exports = { REQUIRED_IDS, readSourceMessages, readXlfTranslations, buildManifest, buildManifests };
