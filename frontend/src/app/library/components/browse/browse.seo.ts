import type { ScoreApiInfo } from '../../../core/api/model/scoreApiInfo';
import { type SeoData, clampDescription } from '../../../shared/seo';
import { musicCollectionStructuredData } from '../../../shared/seo/structured-data';

export type BrowseTab = 'new' | 'artists' | 'genres' | 'popular';

/** Everything the library pages need to describe themselves. */
export interface BrowseSeoState {
  /** The tab in use, whether it came from the URL or from the default. */
  activeTab: BrowseTab;
  scores: ScoreApiInfo[];
  selectedGenre: { genre?: { name?: string; slug?: string } } | null;
  selectedAuthor: { author?: { name?: string; slug?: string } } | null;
  searchKeyword: string;
  totalScores: number;
}

const LIBRARY_PATH = '/library';

export function buildBrowseSeo(state: BrowseSeoState): SeoData {
  const genre = state.selectedGenre?.genre;
  const author = state.selectedAuthor?.author;

  if (genre?.name) {
    const name = capitalize(genre.name);
    const artists = sample(state.scores, s => s.author);
    const description = artists
      ? `Browse and practice ${name} piano scores by ${artists}. Interactive sheet music with hands-separated practice and MIDI support.`
      : `Browse and practice ${name} piano scores on PianoML. Interactive sheet music with hands-separated practice, adjustable tempo and MIDI support.`;

    return {
      title: `${name} Piano Scores`,
      description,
      canonical: `${LIBRARY_PATH}/genres/${genre.slug}`,
      structuredData: musicCollectionStructuredData(state.scores, `${name} Piano Scores`, clampDescription(description))
    };
  }

  if (author?.name) {
    const name = capitalize(author.name);
    const titles = sample(state.scores, s => s.title);
    const description = titles
      ? `Play ${name} piano scores: ${titles}. Interactive sheet music with adjustable tempo and real-time feedback.`
      : `Play ${name} piano scores on PianoML. Interactive sheet music with hands-separated practice, adjustable tempo and real-time feedback.`;

    return {
      title: `${name} Piano Scores`,
      description,
      canonical: `${LIBRARY_PATH}/artists/${author.slug}`,
      structuredData: musicCollectionStructuredData(state.scores, `${name} Piano Works`, clampDescription(description))
    };
  }

  if (state.searchKeyword) {
    return {
      title: `Search: "${state.searchKeyword}"`,
      description: `Piano scores matching "${state.searchKeyword}" in the PianoML library.`,
      // Query-string result pages are not worth indexing; the library pages are.
      noindex: true
    };
  }

  switch (state.activeTab) {
    case 'genres':
      return {
        title: 'Browse Piano Scores by Genre',
        description: withNames(
          state.scores,
          s => s.genre,
          names => `Explore ${state.totalScores}+ piano scores by genre and style — ${names} — with interactive practice features.`,
          `Explore ${state.totalScores}+ piano scores by genre and style, with hands-separated practice, adjustable tempo and MIDI support.`
        ),
        // A bare `/library` shows this same tab, and it is the URL in the sitemap.
        canonical: LIBRARY_PATH,
        structuredData: collectionPage('Browse Piano Scores by Genre', state.totalScores, {
          '@type': 'Thing',
          name: 'Piano Music Genres',
          description: 'Collection of piano music organized by musical genre and style'
        })
      };

    case 'artists':
      return {
        title: 'Browse Piano Scores by Composer & Artist',
        description: withNames(
          state.scores,
          s => s.author,
          names => `Discover ${state.totalScores}+ piano scores and learn works by ${names}.`,
          `Discover ${state.totalScores}+ piano scores by composer, from classical to contemporary, with interactive practice features.`
        ),
        canonical: `${LIBRARY_PATH}/artists`,
        structuredData: collectionPage('Browse Piano Scores by Composer', state.totalScores, {
          '@type': 'Thing',
          name: 'Piano Composers and Artists',
          description: 'Collection of piano works organized by composer and artist'
        })
      };

    case 'new':
      return {
        title: 'New Piano Scores: Latest Uploaded Sheet Music',
        description:
          'Browse the latest piano scores added to PianoML, with hands-separated practice, adjustable tempo and MIDI keyboard support.',
        canonical: `${LIBRARY_PATH}/new`,
        structuredData: collectionPage('New Piano Scores', state.totalScores, {
          '@type': 'CreativeWork',
          name: 'Latest piano scores',
          description: 'Collection of recently uploaded piano sheet music'
        })
      };

    default:
      return {
        title: 'Piano Scores Library: MusicXML, MIDI & PDF Sheet Music',
        description:
          'Browse popular piano scores on PianoML. Interactive sheet music with hands-separated practice, adjustable speed, loopable sections and MIDI keyboard support.',
        canonical: `${LIBRARY_PATH}/popular`,
        structuredData: collectionPage('Piano Score Library', state.totalScores, {
          '@type': 'SoftwareApplication',
          name: 'PianoML - Piano Learning Machine',
          applicationCategory: 'Music Education',
          description: 'Piano learning platform with features for interactive practice'
        })
      };
  }
}

function collectionPage(name: string, numberOfItems: number, about: Record<string, string>) {
  return {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name,
    numberOfItems,
    about
  };
}

/**
 * A few representative names rather than every loaded row — the previous
 * version pasted the whole page into the description, which reads as spam and
 * gets truncated anyway. Null when nothing has loaded yet, which happens on the
 * server render of the tab pages: the caller then words the sentence without
 * the clause instead of naming placeholder genres.
 */
function sample(scores: ScoreApiInfo[], pick: (score: ScoreApiInfo) => string | undefined, limit = 3): string | null {
  const names = Array.from(new Set(scores.map(pick).filter((name): name is string => !!name)));
  const shown = names.slice(0, limit).join(', ');

  if (!shown) return null;
  return names.length > limit ? `${shown} and more` : shown;
}

/** Picks the phrasing that fits whether or not any names are available. */
function withNames(
  scores: ScoreApiInfo[],
  pick: (score: ScoreApiInfo) => string | undefined,
  withClause: (names: string) => string,
  fallback: string
): string {
  const names = sample(scores, pick);
  return names ? withClause(names) : fallback;
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
