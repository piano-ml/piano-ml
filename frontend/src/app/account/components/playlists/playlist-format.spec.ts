import { relativeTime, scorePath } from './playlist-format';

describe('playlist-format', () => {
  const now = Date.parse('2026-11-15T12:00:00Z');

  it('says how long ago, in the page language', () => {
    expect(relativeTime('2026-11-13T12:00:00Z', 'en', now)).toBe('2 days ago');
    expect(relativeTime('2026-11-15T11:00:00Z', 'en', now)).toBe('1 hour ago');
    expect(relativeTime('2026-11-15T11:59:50Z', 'en', now)).toBe('now');
    expect(relativeTime('2026-11-13T12:00:00Z', 'fr', now)).toBe('avant-hier');
    expect(relativeTime(undefined, 'en', now)).toBe('');
  });

  it('links a score by its immutable slug first', () => {
    expect(scorePath({ immutableSlug: 'a', mutableSlug: 'b' })).toEqual(['/score', 'a']);
    expect(scorePath({ mutableSlug: 'b' })).toEqual(['/score', 'b']);
  });
});
