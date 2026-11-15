import { currentLocale, localeInfo } from './i18n';

/**
 * Key and note names in each language's own notation (#381 phase 4): "C minor" is "Do menor" in Spanish,
 * "c-Moll" in German, "가단조" in Korean. Only the display changes: the values the API and the URLs use
 * ("B- major", "f# minor", "F#m") are parsed here and never rewritten.
 */

export type Accidental = 'natural' | 'sharp' | 'flat';
export type Mode = 'major' | 'minor';

export interface ParsedKey {
  /** A to G. */
  letter: string;
  accidental: Accidental;
  /** Absent for a bare note ("C", "F#"). */
  mode?: Mode;
}

/**
 * Reads every spelling the app uses: the API's fullKey ("C major", "B- major", "f# minor", "e- minor"),
 * exercise keys ("C", "Bb", "F#m", "Am") and plain notes. `-` and `b` after the letter are flats.
 * Returns null for anything else.
 */
export function parseKey(value: string | null | undefined): ParsedKey | null {
  const match = (value ?? '').trim().match(/^([A-Ga-g])([#♯]|[b♭-])?(m)?(?:\s+(major|minor))?$/i);
  if (!match) return null;
  const [, letter, sign, minorSuffix, word] = match;
  const accidental: Accidental = !sign ? 'natural' : /[#♯]/.test(sign) ? 'sharp' : 'flat';
  const mode = word ? (word.toLowerCase() as Mode) : minorSuffix ? 'minor' : undefined;
  return { letter: letter.toUpperCase(), accidental, ...(mode ? { mode } : {}) };
}

interface Notation {
  note(letter: string, accidental: Accidental, mode?: Mode): string;
  key(note: string, mode: Mode): string;
  mode(mode: Mode): string;
}

const SIGN: Record<Accidental, string> = { natural: '', sharp: '♯', flat: '♭' };

/** Letters with ♯/♭ (English, Thai), the mode words given. */
function letters(major: string, minor: string, join = ' '): Notation {
  return {
    note: (l, a) => l + SIGN[a],
    key: (n, m) => `${n}${join}${m === 'major' ? major : minor}`,
    mode: (m) => (m === 'major' ? major : minor)
  };
}

/** Do Re Mi solfège with ♯/♭ (Spanish, Italian, French, Ukrainian). */
function solfege(names: Record<string, string>, major: string, minor: string): Notation {
  return {
    note: (l, a) => names[l] + SIGN[a],
    key: (n, m) => `${n} ${m === 'major' ? major : minor}`,
    mode: (m) => (m === 'major' ? major : minor)
  };
}

/**
 * German-style names (German, Polish, Swedish, Dutch): sharps and flats are suffixes (Fis, Es), the major
 * key is capitalised and the minor key lowercase ("Fis-Dur", "fis-Moll").
 */
function germanic(spell: (l: string, a: Accidental) => string, major: string, minor: string): Notation {
  return {
    note: (l, a) => spell(l, a),
    key: (n, m) => (m === 'major' ? `${n}-${major}` : `${n.toLowerCase()}-${minor}`),
    mode: (m) => (m === 'major' ? major : minor)
  };
}

/** German, Polish: B is H, B♭ is B; Es, As (not Ees, Aes). */
function germanSpelling(sharp: string, flat: string, shortFlat: string) {
  return (l: string, a: Accidental): string => {
    if (l === 'B') return a === 'flat' ? 'B' : a === 'sharp' ? `H${sharp}` : 'H';
    if (a === 'sharp') return l + sharp;
    if (a === 'flat') return l === 'E' || l === 'A' ? l + shortFlat : l + flat;
    return l;
  };
}

/** Dutch: B stays B (B♭ is Bes); Es, As. */
function dutchSpelling(l: string, a: Accidental): string {
  if (a === 'sharp') return `${l}is`;
  if (a === 'flat') return l === 'E' || l === 'A' ? `${l}s` : `${l}es`;
  return l;
}

const SOLFEGE_ES_IT = { C: 'Do', D: 'Re', E: 'Mi', F: 'Fa', G: 'Sol', A: 'La', B: 'Si' };

const NOTATIONS: Record<string, Notation> = {
  en: letters('major', 'minor'),
  th: letters('เมเจอร์', 'ไมเนอร์'),
  es: solfege(SOLFEGE_ES_IT, 'mayor', 'menor'),
  it: solfege(SOLFEGE_ES_IT, 'maggiore', 'minore'),
  fr: solfege({ C: 'do', D: 'ré', E: 'mi', F: 'fa', G: 'sol', A: 'la', B: 'si' }, 'majeur', 'mineur'),
  uk: solfege({ C: 'до', D: 'ре', E: 'мі', F: 'фа', G: 'соль', A: 'ля', B: 'сі' }, 'мажор', 'мінор'),
  de: germanic(germanSpelling('is', 'es', 's'), 'Dur', 'Moll'),
  pl: germanic(germanSpelling('is', 'es', 's'), 'dur', 'moll'),
  sv: germanic(germanSpelling('iss', 'ess', 'ss'), 'dur', 'moll'),
  nl: germanic(dutchSpelling, 'majeur', 'mineur'),
  // Chinese: 升 / 降 before the letter, 大调 / 小调 after it ("升F大调", "降B小调").
  'zh-Hans': {
    note: (l, a) => (a === 'sharp' ? '升' : a === 'flat' ? '降' : '') + l,
    key: (n, m) => n + (m === 'major' ? '大调' : '小调'),
    mode: (m) => (m === 'major' ? '大调' : '小调')
  },
  // Korean names: 다 라 마 바 사 가 나, 올림 / 내림, 장조 / 단조 ("올림바장조", "가단조").
  ko: {
    note: (l, a) => (a === 'sharp' ? '올림' : a === 'flat' ? '내림' : '') + ({ C: '다', D: '라', E: '마', F: '바', G: '사', A: '가', B: '나' } as Record<string, string>)[l],
    key: (n, m) => n + (m === 'major' ? '장조' : '단조'),
    mode: (m) => (m === 'major' ? '장조' : '단조')
  }
};

function notation(locale: string): Notation {
  return NOTATIONS[localeInfo(locale).code] ?? NOTATIONS['en'];
}

/** A note ("F#", "Bb", "B-") in the language's notation; the input unchanged when it can't be read. */
export function noteName(value: string | null | undefined, locale: string = currentLocale()): string {
  const key = parseKey(value);
  if (!key) return value ?? '';
  return notation(locale).note(key.letter, key.accidental);
}

/**
 * A key ("C major", "b- minor", "F#m") in the language's notation: "Do mayor", "b-Moll", "올림바단조".
 * A bare note stays a note; the input is returned unchanged when it can't be read.
 */
export function keyName(value: string | null | undefined, locale: string = currentLocale()): string {
  const key = parseKey(value);
  if (!key) return value ?? '';
  const n = notation(locale);
  const note = n.note(key.letter, key.accidental, key.mode);
  return key.mode ? n.key(note, key.mode) : note;
}

/** "major" / "minor" alone, in the language: "mayor", "Moll", "단조". */
export function modeName(mode: Mode, locale: string = currentLocale()): string {
  return notation(locale).mode(mode);
}
