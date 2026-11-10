#!/usr/bin/env node
// Builds a coverage badge (SVG) from a JaCoCo XML or Vitest json-summary report.
//
//   node coverage-badge.mjs --jacoco backend/target/site/jacoco/jacoco.xml --label "backend coverage" --out backend.svg
//   node coverage-badge.mjs --vitest frontend/coverage/piano-ml/coverage-summary.json --label "frontend coverage" --out frontend.svg
//
// The percentage is line coverage; it is also printed to stdout.
import { readFileSync, writeFileSync } from 'node:fs';

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, cur, i, all) => (cur.startsWith('--') ? [...acc, [cur.slice(2), all[i + 1]]] : acc), [])
);

function jacocoLinePct(file) {
  // Report-level counters are the last ones in the document, after every package.
  const matches = [...readFileSync(file, 'utf8').matchAll(/<counter type="LINE" missed="(\d+)" covered="(\d+)"\/>/g)];
  if (matches.length === 0) throw new Error(`No LINE counter in ${file}`);
  const [, missed, covered] = matches.at(-1).map(Number);
  return covered + missed === 0 ? 0 : (covered / (covered + missed)) * 100;
}

function vitestLinePct(file) {
  return JSON.parse(readFileSync(file, 'utf8')).total.lines.pct;
}

function color(pct) {
  if (pct >= 90) return '#4c1';
  if (pct >= 80) return '#97ca00';
  if (pct >= 70) return '#a4a61d';
  if (pct >= 50) return '#dfb317';
  return '#e05d44';
}

// Approximate Verdana 11px glyph width, good enough for short labels.
const textWidth = (s) => Math.round(s.length * 6.5 + 10);

function badge(label, value, fill) {
  const lw = textWidth(label);
  const vw = textWidth(value);
  const w = lw + vw;
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="20" role="img" aria-label="${esc(label)}: ${esc(value)}">
<title>${esc(label)}: ${esc(value)}</title>
<linearGradient id="s" x2="0" y2="100%"><stop offset="0" stop-color="#bbb" stop-opacity=".1"/><stop offset="1" stop-opacity=".1"/></linearGradient>
<clipPath id="r"><rect width="${w}" height="20" rx="3" fill="#fff"/></clipPath>
<g clip-path="url(#r)"><rect width="${lw}" height="20" fill="#555"/><rect x="${lw}" width="${vw}" height="20" fill="${fill}"/><rect width="${w}" height="20" fill="url(#s)"/></g>
<g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" font-size="11">
<text x="${lw / 2}" y="15" fill="#010101" fill-opacity=".3">${esc(label)}</text><text x="${lw / 2}" y="14">${esc(label)}</text>
<text x="${lw + vw / 2}" y="15" fill="#010101" fill-opacity=".3">${esc(value)}</text><text x="${lw + vw / 2}" y="14">${esc(value)}</text>
</g>
</svg>
`;
}

const pct = args.jacoco ? jacocoLinePct(args.jacoco) : args.vitest ? vitestLinePct(args.vitest) : null;
if (pct === null || !args.out) {
  console.error('usage: coverage-badge.mjs (--jacoco <jacoco.xml> | --vitest <coverage-summary.json>) --out <file.svg> [--label <text>]');
  process.exit(2);
}
const value = `${pct.toFixed(1)}%`;
writeFileSync(args.out, badge(args.label ?? 'coverage', value, color(pct)));
console.log(value);
