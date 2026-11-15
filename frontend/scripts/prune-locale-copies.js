#!/usr/bin/env node
/**
 * After a localized build: removes what Angular copies into every language folder but only the root copy
 * serves. Every language build gets its own copy of `assets/` (13 MB) and of the root files (sitemap,
 * robots.txt, web manifests), while the app always fetches `/assets/...` and the root files from the site
 * root. With 12 languages that was ~175 MB of the image for nothing.
 */
const fs = require('fs');
const path = require('path');
const { readLocales } = require('./lib/i18n-config');

const BROWSER_DIR = path.join(__dirname, '..', 'dist', 'piano-ml', 'browser');

/** Root-only entries found in a language folder. */
function rootOnlyEntries(names) {
  return names.filter((name) => name === 'assets' || name === 'robots.txt' || /^sitemap.*\.xml(\.gz)?$/.test(name) || /^manifest\..+\.webmanifest$/.test(name));
}

/** Removes the root-only copies from each prefixed language folder; returns what was removed. */
function prune(browserDir, locales) {
  const removed = [];
  for (const { subPath } of locales) {
    if (!subPath) continue; // the root language owns the real copies
    const dir = path.join(browserDir, subPath);
    if (!fs.existsSync(dir)) continue;
    for (const name of rootOnlyEntries(fs.readdirSync(dir))) {
      fs.rmSync(path.join(dir, name), { recursive: true, force: true });
      removed.push(`${subPath}/${name}`);
    }
  }
  return removed;
}

function main() {
  if (!fs.existsSync(BROWSER_DIR)) {
    console.error(`✗ ${BROWSER_DIR} not found: run the build first`);
    process.exit(1);
  }
  const removed = prune(BROWSER_DIR, readLocales());
  console.log(`✓ Removed ${removed.length} duplicated root files from the language folders`);
}

if (require.main === module) main();

module.exports = { prune, rootOnlyEntries };
