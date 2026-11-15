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
      ? $localize`:@@seo.genre.descriptionWithArtists:Browse and practice ${name}:genre: piano scores by ${artists}:artists:. Interactive sheet music with hands-separated practice and MIDI support.`
      : $localize`:@@seo.genre.description:Browse and practice ${name}:genre: piano scores on PianoML. Interactive sheet music with hands-separated practice, adjustable tempo and MIDI support.`;
    const title = $localize`:@@seo.genre.title:${name}:genre: Piano Scores`;

    return {
      title,
      description,
      canonical: `${LIBRARY_PATH}/genres/${genre.slug}`,
      structuredData: musicCollectionStructuredData(state.scores, title, clampDescription(description))
    };
  }

  if (author?.name) {
    const name = capitalize(author.name);
    const titles = sample(state.scores, s => s.title);
    const description = titles
      ? $localize`:@@seo.artist.descriptionWithTitles:Play ${name}:artist: piano scores: ${titles}:titles:. Interactive sheet music with adjustable tempo and real-time feedback.`
      : $localize`:@@seo.artist.description:Play ${name}:artist: piano scores on PianoML. Interactive sheet music with hands-separated practice, adjustable tempo and real-time feedback.`;

    return {
      title: $localize`:@@seo.artist.title:${name}:artist: Piano Scores`,
      description,
      canonical: `${LIBRARY_PATH}/artists/${author.slug}`,
      structuredData: musicCollectionStructuredData(state.scores, $localize`:@@seo.artist.collection:${name}:artist: Piano Works`, clampDescription(description))
    };
  }

  if (state.searchKeyword) {
    return {
      title: $localize`:@@seo.search.title:Search: "${state.searchKeyword}:keyword:"`,
      description: $localize`:@@seo.search.description:Piano scores matching "${state.searchKeyword}:keyword:" in the PianoML library.`,
      // Query-string result pages are not worth indexing; the library pages are.
      noindex: true
    };
  }

  switch (state.activeTab) {
    case 'genres':
      return {
        title: $localize`:@@seo.genres.title:Browse Piano Scores by Genre`,
        description: withNames(
          state.scores,
          s => s.genre,
          names => $localize`:@@seo.genres.descriptionWithNames:Explore ${state.totalScores}:count:+ piano scores by genre and style — ${names}:genres: — with interactive practice features.`,
          $localize`:@@seo.genres.description:Explore ${state.totalScores}:count:+ piano scores by genre and style, with hands-separated practice, adjustable tempo and MIDI support.`
        ),
        // A bare `/library` shows this same tab, and it is the URL in the sitemap.
        canonical: LIBRARY_PATH,
        structuredData: collectionPage($localize`:@@seo.genres.title:Browse Piano Scores by Genre`, state.totalScores, {
          '@type': 'Thing',
          name: $localize`:@@seo.genres.about.name:Piano Music Genres`,
          description: $localize`:@@seo.genres.about.description:Collection of piano music organized by musical genre and style`
        })
      };

    case 'artists':
      return {
        title: $localize`:@@seo.artists.title:Browse Piano Scores by Composer & Artist`,
        description: withNames(
          state.scores,
          s => s.author,
          names => $localize`:@@seo.artists.descriptionWithNames:Discover ${state.totalScores}:count:+ piano scores and learn works by ${names}:artists:.`,
          $localize`:@@seo.artists.description:Discover ${state.totalScores}:count:+ piano scores by composer, from classical to contemporary, with interactive practice features.`
        ),
        canonical: `${LIBRARY_PATH}/artists`,
        structuredData: collectionPage($localize`:@@seo.artists.collection:Browse Piano Scores by Composer`, state.totalScores, {
          '@type': 'Thing',
          name: $localize`:@@seo.artists.about.name:Piano Composers and Artists`,
          description: $localize`:@@seo.artists.about.description:Collection of piano works organized by composer and artist`
        })
      };

    case 'new':
      return {
        title: $localize`:@@seo.new.title:New Piano Scores: Latest Uploaded Sheet Music`,
        description: $localize`:@@seo.new.description:Browse the latest piano scores added to PianoML, with hands-separated practice, adjustable tempo and MIDI keyboard support.`,
        canonical: `${LIBRARY_PATH}/new`,
        structuredData: collectionPage($localize`:@@seo.new.collection:New Piano Scores`, state.totalScores, {
          '@type': 'CreativeWork',
          name: $localize`:@@seo.new.about.name:Latest piano scores`,
          description: $localize`:@@seo.new.about.description:Collection of recently uploaded piano sheet music`
        })
      };

    default:
      return {
        title: $localize`:@@seo.popular.title:Piano Scores Library: MusicXML, MIDI & PDF Sheet Music`,
        description: $localize`:@@seo.popular.description:Browse popular piano scores on PianoML. Interactive sheet music with hands-separated practice, adjustable speed, loopable sections and MIDI keyboard support.`,
        canonical: `${LIBRARY_PATH}/popular`,
        structuredData: collectionPage($localize`:@@seo.popular.collection:Piano Score Library`, state.totalScores, {
          '@type': 'SoftwareApplication',
          name: 'PianoML - Piano Learning Machine',
          applicationCategory: 'Music Education',
          description: $localize`:@@seo.popular.about.description:Piano learning platform with features for interactive practice`
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
  return names.length > limit ? $localize`:@@seo.namesAndMore:${shown}:names: and more` : shown;
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
