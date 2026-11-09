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
    const description = `Browse and practice ${name} piano scores by ${sample(state.scores, s => s.author)}. Interactive sheet music with hands-separated practice and MIDI support.`;

    return {
      title: `${name} Piano Scores`,
      description,
      canonical: `${LIBRARY_PATH}/genres/${genre.slug}`,
      structuredData: musicCollectionStructuredData(state.scores, `${name} Piano Scores`, clampDescription(description))
    };
  }

  if (author?.name) {
    const name = capitalize(author.name);
    const description = `Play ${name} piano scores: ${sample(state.scores, s => s.title)}. Interactive sheet music with adjustable tempo and real-time feedback.`;

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
        description: `Explore ${state.totalScores}+ piano scores by genre and style — ${sample(state.scores, s => s.genre)} — with interactive practice features.`,
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
        description: `Discover ${state.totalScores}+ piano scores and learn works by ${sample(state.scores, s => s.author)}.`,
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
 * gets truncated anyway.
 */
function sample(scores: ScoreApiInfo[], pick: (score: ScoreApiInfo) => string | undefined, limit = 3): string {
  const names = Array.from(new Set(scores.map(pick).filter((name): name is string => !!name)));
  const shown = names.slice(0, limit).join(', ');

  if (!shown) return 'classical, jazz and contemporary pieces';
  return names.length > limit ? `${shown} and more` : shown;
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
