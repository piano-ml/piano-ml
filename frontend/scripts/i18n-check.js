#!/usr/bin/env node
/**
 * Checks every messages.<code>.xlf of angular.json against the messages in the code (ng extract-i18n):
 * fails when a message is missing, untranslated, or translated from an older English text (stale).
 * Messages no longer in the code are reported and can be dropped. Also checks that angular.json has one
 * dev-server configuration per language (`npm start -- -c fr`).
 *
 *   npm run i18n:check          extracts, then checks (CI)
 *   npm run i18n:check -- --fix  also rewrites each xlf: adds missing units (empty target), drops obsolete
 *                                ones, keeps every translation; stale units keep their target until updated;
 *                                writes the dev-server configurations
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { ANGULAR_JSON, readLocales, syncDevServerConfigs } = require('./lib/i18n-config');
const { readUnits, normalizeSource, writeXlf } = require('./lib/xliff');

const ROOT = path.join(__dirname, '..');

/**
 * Compares the extracted source units with a translation file's units.
 * @returns {{ missing: string[], untranslated: string[], stale: string[], obsolete: string[], units: object[] }}
 *   `units` is the translation file brought up to date (source order, current English, kept targets).
 */
function compare(sourceUnits, translatedUnits) {
  const translated = new Map(translatedUnits.map((unit) => [unit.id, unit]));
  const sourceIds = new Set(sourceUnits.map((unit) => unit.id));
  const result = { missing: [], untranslated: [], stale: [], obsolete: [], units: [] };

  for (const { id, source } of sourceUnits) {
    const existing = translated.get(id);
    if (!existing) {
      result.missing.push(id);
      result.units.push({ id, source, target: null });
      continue;
    }
    if (!existing.target) result.untranslated.push(id);
    else if (normalizeSource(existing.source) !== normalizeSource(source)) result.stale.push(id);
    // A stale unit keeps its old English source, so it stays reported until its translation is updated.
    const isStale = existing.target && normalizeSource(existing.source) !== normalizeSource(source);
    result.units.push({ id, source: isStale ? existing.source : source, target: existing.target });
  }

  for (const { id } of translatedUnits) {
    if (!sourceIds.has(id)) result.obsolete.push(id);
  }
  return result;
}

/** One report line per problem, and whether any problem fails the check. */
function report(file, result) {
  const lines = [];
  const list = (label, ids) => ids.length && lines.push(`${file}: ${ids.length} ${label}: ${ids.join(', ')}`);
  list('missing', result.missing);
  list('untranslated', result.untranslated);
  list('stale (English changed since translated)', result.stale);
  list('obsolete (no longer in the code)', result.obsolete);
  const failed = result.missing.length + result.untranslated.length + result.stale.length > 0;
  return { lines, failed };
}

function extract() {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'pianoml-i18n-'));
  execFileSync('npx', ['ng', 'extract-i18n', '--output-path', out], { cwd: ROOT, stdio: ['ignore', 'ignore', 'inherit'] });
  return fs.readFileSync(path.join(out, 'messages.xlf'), 'utf8');
}

function main() {
  const fix = process.argv.includes('--fix');
  const sourceUnits = readUnits(extract());
  const [source, ...locales] = readLocales();
  let failed = false;

  for (const locale of locales) {
    const file = locale.translation;
    const full = path.join(ROOT, file);
    const result = compare(sourceUnits, fs.existsSync(full) ? readUnits(fs.readFileSync(full, 'utf8')) : []);
    const { lines, failed: localeFailed } = report(file, result);

    for (const line of lines) console.log(line);
    if (fix) {
      fs.writeFileSync(full, writeXlf(result.units, source.code, locale.code), 'utf8');
      console.log(`✎ ${file} updated`);
    }
    failed ||= localeFailed;
    if (!lines.length) console.log(`✓ ${file}: ${sourceUnits.length} messages translated`);
  }

  // One `ng serve` configuration per language (`npm start -- -c fr`), derived from the i18n section.
  const angularJson = JSON.parse(fs.readFileSync(ANGULAR_JSON, 'utf8'));
  const devServer = syncDevServerConfigs(angularJson);
  if (!devServer.changed) {
    console.log('✓ angular.json: one dev-server configuration per language');
  } else if (fix) {
    fs.writeFileSync(ANGULAR_JSON, `${JSON.stringify(devServer.json, null, 2)}\n`, 'utf8');
    console.log('✎ angular.json: dev-server configurations updated');
  } else {
    console.log('angular.json: the per-language dev-server configurations do not match the i18n section');
    failed = true;
  }

  if (failed) {
    console.error('✗ i18n check failed: run `npm run i18n:check -- --fix`, then translate any new units.');
    process.exit(1);
  }
}

if (require.main === module) main();

module.exports = { compare, report };
