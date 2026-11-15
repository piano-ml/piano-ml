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
