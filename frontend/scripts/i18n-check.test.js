// node --test scripts/i18n-check.test.js
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { compare, report } = require('./i18n-check');
const { readUnits, readTranslations, normalizeSource, writeXlf } = require('./lib/xliff');

const unit = (id, source, target = null) => ({ id, source, target });

test('a complete translation passes', () => {
  const result = compare([unit('a', 'Home')], [unit('a', 'Home', 'Inicio')]);
  assert.deepEqual([result.missing, result.untranslated, result.stale, result.obsolete], [[], [], [], []]);
  assert.equal(report('x.xlf', result).failed, false);
});

test('fails on a missing, an untranslated or a stale message', () => {
  const result = compare(
    [unit('new', 'New'), unit('empty', 'Empty'), unit('changed', 'Browse the library')],
    [unit('empty', 'Empty'), unit('changed', 'Browse', 'Explorar')]
  );
  assert.deepEqual(result.missing, ['new']);
  assert.deepEqual(result.untranslated, ['empty']);
  assert.deepEqual(result.stale, ['changed']);
  const { failed, lines } = report('messages.es.xlf', result);
  assert.equal(failed, true);
  assert.match(lines.join('\n'), /1 missing: new/);
});

test('reports obsolete messages without failing, and the fix drops them', () => {
  const result = compare([unit('a', 'Home')], [unit('a', 'Home', 'Inicio'), unit('gone', 'Old', 'Viejo')]);
  assert.deepEqual(result.obsolete, ['gone']);
  assert.equal(report('x.xlf', result).failed, false);
  assert.deepEqual(result.units.map((u) => u.id), ['a']);
});

test('the fixed file follows the code order, keeps translations, and keeps a stale unit stale', () => {
  const result = compare(
    [unit('b', 'B'), unit('a', 'A2'), unit('c', 'C')],
    [unit('a', 'A1', 'Ah'), unit('b', 'B', 'Be')]
  );
  assert.deepEqual(result.units, [unit('b', 'B', 'Be'), unit('a', 'A1', 'Ah'), unit('c', 'C', null)]);
  // Checked again after the fix, the stale unit is still reported until someone updates it.
  assert.deepEqual(compare([unit('b', 'B'), unit('a', 'A2'), unit('c', 'C')], result.units).stale, ['a']);
});

test('placeholders compare by id, whatever expression they stand for', () => {
  assert.equal(
    normalizeSource('Hello <x id="INTERPOLATION" equiv-text="{{ name }}"/>!'),
    normalizeSource('Hello  <x id="INTERPOLATION" equiv-text="{{ user.name }}"/>!')
  );
  assert.notEqual(normalizeSource('<x id="INTERPOLATION"/> scores'), normalizeSource('<x id="INTERPOLATION_1"/> scores'));
});

test('writes and reads back a translation file, placeholders and entities untouched', () => {
  const units = [
    unit('greet', 'Hello <x id="INTERPOLATION" equiv-text="{{ name }}"/> &amp; welcome', 'Hola <x id="INTERPOLATION" equiv-text="{{ name }}"/> y bienvenido'),
    unit('todo', 'To do')
  ];
  const xml = writeXlf(units, 'en', 'es');
  assert.match(xml, /target-language="es"/);
  assert.match(xml, /<target state="new"><\/target>/);
  assert.deepEqual(readUnits(xml), units);
  assert.deepEqual(readTranslations(xml), { greet: 'Hola  y bienvenido' });
});
