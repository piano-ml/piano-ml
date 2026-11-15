// node --test scripts/i18n-generators.test.js
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { localesFromAngularJson, localizedPath, ogLocaleOf, readLocales } = require('./lib/i18n-config');
const { renderLocalesModule } = require('./generate-locales');
const { renderRobots } = require('./generate-robots');

const sample = (i18n) => ({ projects: { 'piano-ml': { i18n } } });

const SAMPLE = sample({
  sourceLocale: { code: 'en', subPath: '' },
  locales: {
    es: { translation: 'src/locale/messages.es.xlf', subPath: 'es' },
    'pt-BR': 'src/locale/messages.pt-BR.xlf'
  }
});

test('lists the source locale first, then each locale with its prefix and translation', () => {
  assert.deepEqual(localesFromAngularJson(SAMPLE), [
    { code: 'en', subPath: '', translation: null, ogLocale: 'en_US' },
    { code: 'es', subPath: 'es', translation: 'src/locale/messages.es.xlf', ogLocale: 'es_ES' },
    { code: 'pt-BR', subPath: 'pt-BR', translation: 'src/locale/messages.pt-BR.xlf', ogLocale: 'pt_BR' }
  ]);
});

test('accepts a plain string source locale, whose prefix defaults to its code like Angular does', () => {
  const [source] = localesFromAngularJson(sample({ sourceLocale: 'fr', locales: {} }));
  assert.deepEqual(source, { code: 'fr', subPath: 'fr', translation: null, ogLocale: 'fr_FR' });
});

test('rejects a config without i18n, or two locales on the same prefix', () => {
  assert.throws(() => localesFromAngularJson({ projects: { 'piano-ml': {} } }), /no i18n section/);
  assert.throws(
    () => localesFromAngularJson(sample({ sourceLocale: { code: 'en', subPath: '' }, locales: { es: { translation: 'x', subPath: '' } } })),
    /share the URL prefix/
  );
});

test('derives the Open Graph locale from the most likely region', () => {
  assert.equal(ogLocaleOf('en'), 'en_US');
  assert.equal(ogLocaleOf('es'), 'es_ES');
  assert.equal(ogLocaleOf('es-MX'), 'es_MX');
});

test('prefixes paths for non-root locales only', () => {
  const [en, es] = localesFromAngularJson(SAMPLE);
  assert.equal(localizedPath('/library', en), '/library');
  assert.equal(localizedPath('/', en), '/');
  assert.equal(localizedPath('/library', es), '/es/library');
  assert.equal(localizedPath('/', es), '/es/');
  assert.equal(localizedPath('work/', es), '/es/work/');
});

test('the repository angular.json serves English at the root and Spanish under /es/', () => {
  const locales = readLocales();
  assert.deepEqual(locales.slice(0, 2).map(({ code, subPath }) => ({ code, subPath })), [
    { code: 'en', subPath: '' },
    { code: 'es', subPath: 'es' }
  ]);
});

test('the generated locales module carries code, prefix and og:locale only', () => {
  const module = renderLocalesModule(localesFromAngularJson(SAMPLE));
  assert.match(module, /export const LOCALES: readonly LocaleInfo\[\] = /);
  const json = JSON.parse(module.slice(module.indexOf('= ') + 2, module.lastIndexOf(';')));
  assert.deepEqual(json, [
    { code: 'en', subPath: '', ogLocale: 'en_US' },
    { code: 'es', subPath: 'es', ogLocale: 'es_ES' },
    { code: 'pt-BR', subPath: 'pt-BR', ogLocale: 'pt_BR' }
  ]);
});

test('robots.txt disallows each private path in each language, with one sitemap line', () => {
  const robots = renderRobots(localesFromAngularJson(SAMPLE), ['/work/', '/score/*/reimport'], 'https://example.org/sitemap.xml');
  const lines = robots.split('\n');

  assert.deepEqual(
    lines.filter(line => line.startsWith('Disallow:')),
    [
      'Disallow: /work/',
      'Disallow: /score/*/reimport',
      'Disallow: /es/work/',
      'Disallow: /es/score/*/reimport',
      'Disallow: /pt-BR/work/',
      'Disallow: /pt-BR/score/*/reimport'
    ]
  );
  assert.equal(lines.filter(line => line.startsWith('User-agent:')).length, 1);
  assert.deepEqual(lines.filter(line => line.startsWith('Sitemap:')), ['Sitemap: https://example.org/sitemap.xml']);
});

test('the default robots.txt keeps every path the hand-written one had', () => {
  const robots = renderRobots(localesFromAngularJson(SAMPLE));
  for (const privatePath of ['/work/', '/account/', '/desktop/', '/workbench/', '/blog/legal', '/blog/help', '/import/', '/score/*/reimport']) {
    assert.ok(robots.includes(`Disallow: ${privatePath}\n`), privatePath);
  }
  assert.ok(robots.includes('Sitemap: https://pianoml.org/sitemap.xml'));
});

// --- Web app manifests ---------------------------------------------------------------------------------
const { readSourceMessages, readXlfTranslations, buildManifests, REQUIRED_IDS } = require('./generate-webmanifest');

const SOURCE_TS = [
  'export const NAV = {',
  '  home: $localize`:@@nav.home:Home`,',
  '  browse: $localize`:@@nav.browse:Browse`,',
  '  exercises: $localize`:@@nav.exercises:Exercises`',
  '};',
  'export const APP_MANIFEST = {',
  '  name: $localize`:@@manifest.name:PianoML: Learn Piano`,',
  '  shortName: $localize`:@@manifest.shortName:PianoML`,',
  '  description: $localize`:@@manifest.description:Learn piano, it\\`s fun & free.`',
  '};'
].join('\n');

const ES_XLF = `<?xml version="1.0" encoding="UTF-8" ?>
<xliff version="1.2" xmlns="urn:oasis:names:tc:xliff:document:1.2">
  <file source-language="en" target-language="es" datatype="plaintext" original="ng2.template">
    <body>
      <trans-unit id="nav.home" datatype="html"><source>Home</source><target state="translated">Inicio</target></trans-unit>
      <trans-unit id="nav.browse" datatype="html"><source>Browse</source><target>Explorar</target></trans-unit>
      <trans-unit id="nav.exercises" datatype="html"><source>Exercises</source><target state="new"></target></trans-unit>
      <trans-unit id="manifest.description" datatype="html"><source>x</source><target>Aprende piano &amp; más</target></trans-unit>
    </body>
  </file>
</xliff>`;

const THEME = { themeColor: '#000000', backgroundColor: '#171717' };
const manifestsFor = (locales) =>
  buildManifests(locales, readSourceMessages(SOURCE_TS), (file) => (file.includes('.es.') ? ES_XLF : null), THEME);

test('reads the reserved English messages from the TypeScript source', () => {
  const messages = readSourceMessages(SOURCE_TS);
  assert.equal(messages['nav.home'], 'Home');
  assert.equal(messages['manifest.description'], 'Learn piano, it`s fun & free.');
  assert.deepEqual(Object.keys(messages).sort(), [...REQUIRED_IDS].sort());
});

test('the real app-messages.ts declares every id the manifest needs', () => {
  const source = require('fs').readFileSync(require('path').join(__dirname, '../src/app/shared/i18n/app-messages.ts'), 'utf8');
  const messages = readSourceMessages(source);
  for (const id of REQUIRED_IDS) assert.ok(messages[id], id);
});

test('reads translated targets, decoding entities and skipping empty ones', () => {
  assert.deepEqual(readXlfTranslations(ES_XLF), {
    'nav.home': 'Inicio',
    'nav.browse': 'Explorar',
    'manifest.description': 'Aprende piano & más'
  });
  assert.deepEqual(readXlfTranslations('<unit id="nav.home"><segment><source>Home</source><target>Inicio</target></segment></unit>'), {
    'nav.home': 'Inicio'
  });
});

test('writes one manifest per language: one app id, localized start_url and 3 shortcuts', () => {
  const manifests = manifestsFor(localesFromAngularJson(SAMPLE));
  assert.deepEqual(Object.keys(manifests), ['manifest.en.webmanifest', 'manifest.es.webmanifest', 'manifest.pt-BR.webmanifest']);

  const en = manifests['manifest.en.webmanifest'];
  const es = manifests['manifest.es.webmanifest'];
  for (const manifest of Object.values(manifests)) {
    assert.equal(manifest.id, '/');
    assert.equal(manifest.scope, '/');
    assert.equal(manifest.theme_color, '#000000');
    assert.equal(manifest.background_color, '#171717');
    assert.deepEqual(manifest.icons.map((icon) => `${icon.sizes} ${icon.purpose}`), ['192x192 any', '512x512 any', '512x512 maskable']);
  }

  assert.equal(en.lang, 'en');
  assert.equal(en.start_url, '/');
  assert.deepEqual(en.shortcuts.map((s) => [s.name, s.url]), [['Home', '/'], ['Browse', '/library'], ['Exercises', '/exercises']]);

  assert.equal(es.lang, 'es');
  assert.equal(es.start_url, '/es/');
  assert.equal(es.description, 'Aprende piano & más');
  // An untranslated message (empty target, or no unit at all) falls back to English.
  assert.deepEqual(es.shortcuts.map((s) => [s.name, s.url]), [['Inicio', '/es/'], ['Explorar', '/es/library'], ['Exercises', '/es/exercises']]);
  assert.equal(es.name, 'PianoML: Learn Piano');
});

test('a language without a translation file gets an English manifest under its own prefix', () => {
  const pt = manifestsFor(localesFromAngularJson(SAMPLE))['manifest.pt-BR.webmanifest'];
  assert.equal(pt.lang, 'pt-BR');
  assert.equal(pt.start_url, '/pt-BR/');
  assert.deepEqual(pt.shortcuts.map((s) => s.name), ['Home', 'Browse', 'Exercises']);
});

test('refuses to build when a reserved message is missing from the source', () => {
  assert.throws(() => buildManifests(localesFromAngularJson(SAMPLE), { 'nav.home': 'Home' }, () => null, THEME), /does not declare/);
});

// --- Sitemap ---------------------------------------------------------------------------------------------
const { generateSitemap, renderSitemaps } = require('./generate-sitemap');

const PAGES = [
  { path: '/library', priority: '1', lastmod: '2026-01-01' },
  { path: '/blog/just-play', priority: '0.5', lastmod: '2026-01-01', englishOnly: true }
];

test('lists every page in every language, each with all alternates plus x-default', () => {
  const [en, es] = localesFromAngularJson(SAMPLE);
  const { 'sitemap.xml': xml, ...others } = renderSitemaps(PAGES, [en, es]);
  assert.deepEqual(Object.keys(others), []);
  assert.match(xml, /xmlns:xhtml="http:\/\/www.w3.org\/1999\/xhtml"/);

  const urls = [...xml.matchAll(/<url>([\s\S]*?)<\/url>/g)].map(([, body]) => ({
    loc: body.match(/<loc>(.*)<\/loc>/)[1],
    alternates: [...body.matchAll(/hreflang="([^"]+)" href="([^"]+)"/g)].map(([, lang, href]) => `${lang} ${href}`)
  }));
  const expected = [
    'en https://pianoml.org/library',
    'es https://pianoml.org/es/library',
    'x-default https://pianoml.org/library'
  ];
  assert.deepEqual(urls, [
    { loc: 'https://pianoml.org/library', alternates: expected },
    { loc: 'https://pianoml.org/blog/just-play', alternates: [] },
    { loc: 'https://pianoml.org/es/library', alternates: expected }
  ]);
  assert.ok(!xml.includes('/es/blog/'), 'non-English blog posts are left out');
});

test('becomes an index of one sitemap per language past the limits', () => {
  const locales = localesFromAngularJson(SAMPLE);
  const files = renderSitemaps(PAGES, locales, { urls: 3, bytes: Infinity });
  assert.deepEqual(Object.keys(files).sort(), ['sitemap-en.xml', 'sitemap-es.xml', 'sitemap-pt-BR.xml', 'sitemap.xml']);
  assert.match(files['sitemap.xml'], /<sitemapindex/);
  assert.deepEqual([...files['sitemap.xml'].matchAll(/<loc>(.*)<\/loc>/g)].map(([, loc]) => loc), [
    'https://pianoml.org/sitemap-en.xml',
    'https://pianoml.org/sitemap-es.xml',
    'https://pianoml.org/sitemap-pt-BR.xml'
  ]);
  assert.match(files['sitemap-es.xml'], /<loc>https:\/\/pianoml.org\/es\/library<\/loc>/);
  assert.ok(!files['sitemap-es.xml'].includes('blog'));
});

test('builds score, artist and genre pages from the API data, in every language', () => {
  const log = console.log;
  console.log = () => undefined;
  try {
    const { files, urls } = generateSitemap(
      [{ genre: { slug: 'jazz' }, count: 3 }],
      [{ author: { slug: 'erik-satie' }, count: 5 }],
      [{ immutableSlug: 'gymnopedie-1' }],
      localesFromAngularJson(SAMPLE).slice(0, 2),
      [{ path: '/', priority: '1.0' }]
    );
    assert.deepEqual(urls.map((u) => u.path).sort(), ['/', '/library/artists/erik-satie', '/library/genres/jazz', '/score/gymnopedie-1']);
    for (const loc of ['https://pianoml.org/es/score/gymnopedie-1', 'https://pianoml.org/score/gymnopedie-1', 'https://pianoml.org/es/']) {
      assert.ok(files['sitemap.xml'].includes(`<loc>${loc}</loc>`), loc);
    }
  } finally {
    console.log = log;
  }
});
