import { SITE } from './seo.model';

/** Narrow view of a score, covering what the schema.org mapping needs. */
interface ScoreLike {
  title?: string;
  slug?: string;
  author?: string | { name?: string };
  genre?: string | { name?: string };
}

const UNKNOWN = 'Unknown';

/** A `CollectionPage` of `MusicComposition` items, as used by the library pages. */
export function musicCollectionStructuredData(scores: ScoreLike[], collectionName: string, description: string) {
  return {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: collectionName,
    description,
    numberOfItems: scores.length,
    itemListElement: scores.slice(0, 10).map((score, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      item: {
        '@type': 'MusicComposition',
        name: score.title,
        composer: { '@type': 'Person', name: nameOf(score.author) },
        genre: nameOf(score.genre),
        url: `${SITE.url}/score/${score.slug}`
      }
    }))
  };
}

function nameOf(value: string | { name?: string } | undefined): string {
  if (!value) return UNKNOWN;
  return (typeof value === 'string' ? value : value.name) || UNKNOWN;
}
