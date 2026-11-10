// node --test .github/scripts/coverage-badge.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(new URL('./coverage-badge.mjs', import.meta.url));
const dir = mkdtempSync(join(tmpdir(), 'coverage-badge-'));

function run(...args) {
  return spawnSync(process.execPath, [script, ...args], { encoding: 'utf8' });
}

function jacoco(packageLine, reportLine) {
  const file = join(dir, `jacoco-${Math.random()}.xml`);
  writeFileSync(file, `<report name="backend"><package name="p">
    <counter type="LINE" missed="${packageLine[0]}" covered="${packageLine[1]}"/></package>
    <counter type="INSTRUCTION" missed="1" covered="1"/>
    <counter type="LINE" missed="${reportLine[0]}" covered="${reportLine[1]}"/></report>`);
  return file;
}

function vitest(pct) {
  const file = join(dir, `summary-${Math.random()}.json`);
  writeFileSync(file, JSON.stringify({ total: { lines: { pct } } }));
  return file;
}

test('JaCoCo: uses the report-level LINE counter (the last one), not a package counter', () => {
  const out = join(dir, 'backend.svg');
  const result = run('--jacoco', jacoco([0, 10], [75, 25]), '--label', 'backend coverage', '--out', out);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), '25.0%');
  const svg = readFileSync(out, 'utf8');
  assert.match(svg, /^<svg /);
  assert.match(svg, /aria-label="backend coverage: 25.0%"/);
  assert.match(svg, /fill="#e05d44"/);
});

test('Vitest: reads total.lines.pct', () => {
  const out = join(dir, 'frontend.svg');
  const result = run('--vitest', vitest(91.234), '--label', 'frontend coverage', '--out', out);
  assert.equal(result.stdout.trim(), '91.2%');
  assert.match(readFileSync(out, 'utf8'), /fill="#4c1"/);
});

test('color thresholds', () => {
  const cases = [[95, '#4c1'], [85, '#97ca00'], [75, '#a4a61d'], [55, '#dfb317'], [10, '#e05d44']];
  for (const [pct, color] of cases) {
    const out = join(dir, `c${pct}.svg`);
    run('--vitest', vitest(pct), '--out', out);
    assert.match(readFileSync(out, 'utf8'), new RegExp(`fill="${color}"`), `${pct}%`);
  }
});

test('default label, and labels are XML-escaped', () => {
  const plain = join(dir, 'plain.svg');
  run('--vitest', vitest(50), '--out', plain);
  assert.match(readFileSync(plain, 'utf8'), /aria-label="coverage: 50.0%"/);

  const escaped = join(dir, 'escaped.svg');
  run('--vitest', vitest(50), '--label', 'a<b&c', '--out', escaped);
  assert.match(readFileSync(escaped, 'utf8'), /a&lt;b&amp;c/);
});

test('a JaCoCo report with no lines is 0%', () => {
  const out = join(dir, 'empty.svg');
  assert.equal(run('--jacoco', jacoco([0, 0], [0, 0]), '--out', out).stdout.trim(), '0.0%');
});

test('fails clearly on a report without LINE counters', () => {
  const file = join(dir, 'broken.xml');
  writeFileSync(file, '<report/>');
  const result = run('--jacoco', file, '--out', join(dir, 'x.svg'));
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /No LINE counter/);
});

test('prints usage and exits 2 without a report or output path', () => {
  for (const args of [[], ['--vitest', vitest(1)], ['--out', join(dir, 'y.svg')]]) {
    const result = run(...args);
    assert.equal(result.status, 2);
    assert.match(result.stderr, /usage:/);
  }
});
