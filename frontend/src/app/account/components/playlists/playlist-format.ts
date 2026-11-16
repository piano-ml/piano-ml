import { ScoreApiInfo } from '../../../core/api';

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 365 * 24 * 3600],
  ['month', 30 * 24 * 3600],
  ['week', 7 * 24 * 3600],
  ['day', 24 * 3600],
  ['hour', 3600],
  ['minute', 60],
];

/** "2 days ago", "in 3 hours", "now"... in the page's language; the words come from the browser. */
export function relativeTime(iso: string | undefined, locale: string, now: number = Date.now()): string {
  if (!iso) {
    return '';
  }
  const seconds = (new Date(iso).getTime() - now) / 1000;
  if (Number.isNaN(seconds)) {
    return '';
  }
  const format = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  for (const [unit, size] of UNITS) {
    if (Math.abs(seconds) >= size) {
      return format.format(Math.round(seconds / size), unit);
    }
  }
  return format.format(0, 'second');
}

/** A calendar date ("3 Mar 2026") in the page's language. */
export function shortDate(iso: string | undefined, locale: string): string {
  return iso ? new Date(iso).toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' }) : '';
}

/** Path of a score's page. */
export function scorePath(score: ScoreApiInfo | undefined): string[] {
  return ['/score', score?.immutableSlug || score?.mutableSlug || score?.id || ''];
}
