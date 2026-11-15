/**
 * Minimal XLIFF 1.2 reading and writing for Angular's extracted messages: units keep their inner XML as is,
 * placeholders (`<x id="INTERPOLATION" .../>`) included, so a translation round-trips untouched.
 */

const decodeXml = (text) =>
  text
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&amp;/g, '&');

const encodeXml = (text) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * Every unit of an XLIFF 1.2 or 2.0 file, in file order: `{ id, source, target }`, `source` and `target`
 * being inner XML (target null when absent or empty).
 */
function readUnits(xml) {
  const units = [];
  const pattern = /<(trans-unit|unit)\b[^>]*?\bid="([^"]+)"[^>]*>([\s\S]*?)<\/\1>/g;
  for (const [, , id, body] of xml.matchAll(pattern)) {
    const source = body.match(/<source\b[^>]*>([\s\S]*?)<\/source>/);
    const target = body.match(/<target\b[^>]*>([\s\S]*?)<\/target>/);
    units.push({ id, source: source ? source[1] : '', target: target && target[1].trim() ? target[1] : null });
  }
  return units;
}

/** `{ id: plain text }` of every translated unit (placeholders dropped): enough for plain-text messages. */
function readTranslations(xml) {
  const translations = {};
  for (const { id, target } of readUnits(xml)) {
    if (target) translations[id] = decodeXml(target.replace(/<x\b[^>]*\/>/g, '')).trim();
  }
  return translations;
}

/**
 * The text of a message for comparison: the source as written, placeholders reduced to their id, since
 * their `equiv-text` only records the expression they stand for.
 */
function normalizeSource(source) {
  return source.replace(/<x\b[^>]*?\bid="([^"]+)"[^>]*\/>/g, '{$1}').replace(/\s+/g, ' ').trim();
}

/** An XLIFF 1.2 translation file for `units` (`{ id, source, target }`, inner XML). */
function writeXlf(units, sourceLanguage, targetLanguage) {
  const lines = [
    '<?xml version="1.0" encoding="UTF-8" ?>',
    '<xliff version="1.2" xmlns="urn:oasis:names:tc:xliff:document:1.2">',
    `  <file source-language="${sourceLanguage}" target-language="${targetLanguage}" datatype="plaintext" original="ng2.template">`,
    '    <body>'
  ];
  for (const { id, source, target } of units) {
    lines.push(`      <trans-unit id="${id}" datatype="html">`, `        <source>${source}</source>`);
    lines.push(target ? `        <target state="translated">${target}</target>` : '        <target state="new"></target>');
    lines.push('      </trans-unit>');
  }
  lines.push('    </body>', '  </file>', '</xliff>', '');
  return lines.join('\n');
}

module.exports = { readUnits, readTranslations, normalizeSource, writeXlf, decodeXml, encodeXml };
