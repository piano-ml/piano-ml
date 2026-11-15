import { describe, expect, it } from 'vitest';
import { keyName, modeName, noteName, parseKey } from './music-names';

describe('parseKey', () => {
  it.each([
    ['C major', { letter: 'C', accidental: 'natural', mode: 'major' }],
    ['f# minor', { letter: 'F', accidental: 'sharp', mode: 'minor' }],
    ['B- major', { letter: 'B', accidental: 'flat', mode: 'major' }],
    ['b- Minor', { letter: 'B', accidental: 'flat', mode: 'minor' }],
    ['  e   minor ', { letter: 'E', accidental: 'natural', mode: 'minor' }],
    ['Bb', { letter: 'B', accidental: 'flat' }],
    ['F#m', { letter: 'F', accidental: 'sharp', mode: 'minor' }],
    ['Bbm', { letter: 'B', accidental: 'flat', mode: 'minor' }],
    ['Am', { letter: 'A', accidental: 'natural', mode: 'minor' }],
  ])('reads %s', (value, expected) => {
    expect(parseKey(value)).toEqual(expected);
  });

  it.each(['', '  ', 'H major', 'C dorian', 'C major extra', 'major', null, undefined])('rejects %s', (value) => {
    expect(parseKey(value)).toBeNull();
  });
});

describe('keyName', () => {
  it.each([
    ['en', 'B- major', 'B♭ major'],
    ['en', 'f# minor', 'F♯ minor'],
    ['es', 'B- major', 'Si♭ mayor'],
    ['es', 'c minor', 'Do menor'],
    ['it', 'f# minor', 'Fa♯ minore'],
    ['fr', 'e- major', 'mi♭ majeur'],
    ['uk', 'a minor', 'ля мінор'],
    ['th', 'C major', 'C เมเจอร์'],
    ['de', 'B- major', 'B-Dur'],
    ['de', 'b minor', 'h-Moll'],
    ['de', 'f# minor', 'fis-Moll'],
    ['de', 'E- major', 'Es-Dur'],
    ['de', 'A- major', 'As-Dur'],
    ['de', 'D- major', 'Des-Dur'],
    ['pl', 'c minor', 'c-moll'],
    ['sv', 'E- major', 'Ess-dur'],
    ['sv', 'f# minor', 'fiss-moll'],
    ['nl', 'B- major', 'Bes-majeur'],
    ['nl', 'b minor', 'b-mineur'],
    ['nl', 'E- major', 'Es-majeur'],
    ['zh-Hans', 'f# major', '升F大调'],
    ['zh-Hans', 'B- minor', '降B小调'],
    ['ko', 'f# major', '올림바장조'],
    ['ko', 'a minor', '가단조'],
    ['ko', 'B- major', '내림나장조'],
    ['es', 'F#m', 'Fa♯ menor'],
  ])('%s: %s is %s', (locale, value, expected) => {
    expect(keyName(value, locale)).toBe(expected);
  });

  it('keeps a bare note a note', () => {
    expect(keyName('Bb', 'de')).toBe('B');
    expect(keyName('F#', 'es')).toBe('Fa♯');
  });

  it('returns unreadable values unchanged', () => {
    expect(keyName('C dorian', 'es')).toBe('C dorian');
    expect(keyName(undefined, 'es')).toBe('');
  });

  it('falls back to English for an unknown language', () => {
    expect(keyName('B- major', 'xx')).toBe('B♭ major');
  });
});

describe('noteName and modeName', () => {
  it.each([
    ['en', 'Bb', 'B♭'],
    ['en', 'Am', 'A'],
    ['es', 'Am', 'La'],
    ['fr', 'C#m', 'do♯'],
    ['de', 'B', 'H'],
    ['de', 'Bb', 'B'],
    ['de', 'Eb', 'Es'],
    ['nl', 'Bb', 'Bes'],
    ['zh-Hans', 'Db', '降D'],
    ['ko', 'G', '사'],
  ])('%s: %s is %s', (locale, value, expected) => {
    expect(noteName(value, locale)).toBe(expected);
  });

  it('names the modes', () => {
    expect(modeName('minor', 'es')).toBe('menor');
    expect(modeName('minor', 'de')).toBe('Moll');
    expect(modeName('major', 'ko')).toBe('장조');
  });
});
