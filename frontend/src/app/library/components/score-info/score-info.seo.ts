import type { ScoreApiInfo } from '../../../core/api';
import { SITE, type SeoData } from '../../../shared/seo';

const UNKNOWN_AUTHOR = 'Unknown Artist';
const UNTITLED = 'Untitled';

/** Builds the metadata for a single score page. */
export function buildScoreSeo(score: ScoreApiInfo | null, slug: string | null, genreName?: string): SeoData {
  if (!score) {
    return { title: 'Score', noindex: true };
  }

  const author = (score.author || '').trim() || UNKNOWN_AUTHOR;
  const title = (score.title || '').trim() || UNTITLED;
  const genre = (genreName || score.genre || '').trim();
  const canonical = `/score/${score.immutableSlug || score.mutableSlug || slug}`;

  return {
    title: `${author} - ${title}`,
    description: describe(score, author, title, genre),
    canonical,
    type: 'music.song',
    structuredData: {
      '@context': 'https://schema.org',
      '@type': 'MusicComposition',
      name: title,
      composer: { '@type': 'Person', name: author },
      ...(genre ? { genre } : {}),
      inLanguage: 'en',
      url: `${SITE.url}${canonical}`
    }
  };
}

/**
 * Prefers the score's own description, and otherwise writes one from what we
 * know — a shared fallback would give every score page the same snippet.
 */
function describe(score: ScoreApiInfo, author: string, title: string, genre: string): string {
  const own = (score.description || '').trim();
  if (own) return own;

  const kind = genre ? `${genre} piano score` : 'piano score';
  const licence = score.publicDomain ? ' Free to download and public domain.' : '';

  return `Practice ${title} by ${author} on PianoML: an interactive ${kind} with hands-separated practice, adjustable tempo and MIDI feedback.${licence}`;
}
