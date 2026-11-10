import type { ScoreApiInfo } from '../../../core/api/model/scoreApiInfo';
import { type BrowseSeoState, buildBrowseSeo } from './browse.seo';

function state(overrides: Partial<BrowseSeoState> = {}): BrowseSeoState {
  return {
    activeTab: 'popular',
    scores: [],
    selectedGenre: null,
    selectedAuthor: null,
    searchKeyword: '',
    totalScores: 3000,
    ...overrides
  };
}

const scores = [
  { title: 'Prelude', author: 'Bach', genre: 'baroque' },
  { title: 'Nocturne', author: 'Chopin', genre: 'romantic' },
  { title: 'Clair de Lune', author: 'Debussy', genre: 'impressionist' },
  { title: 'Gymnopédie', author: 'Satie', genre: 'modern' }
] as ScoreApiInfo[];

describe('buildBrowseSeo', () => {
  it('canonicalizes the genres tab to /library, which shows the same thing', () => {
    expect(buildBrowseSeo(state({ activeTab: 'genres' })).canonical).toBe('/library');
  });

  it('describes a genre page with a sample of its artists, not all of them', () => {
    const seo = buildBrowseSeo(state({ selectedGenre: { genre: { name: 'baroque', slug: 'baroque' } }, scores }));

    expect(seo.title).toBe('Baroque Piano Scores');
    expect(seo.canonical).toBe('/library/genres/baroque');
    expect(seo.description).toContain('Bach, Chopin, Debussy and more');
    expect(seo.description).not.toContain('Satie');
  });

  it('points an artist page at its own URL', () => {
    const seo = buildBrowseSeo(state({ selectedAuthor: { author: { name: 'chopin', slug: 'chopin' } }, scores }));

    expect(seo.title).toBe('Chopin Piano Scores');
    expect(seo.canonical).toBe('/library/artists/chopin');
  });

  it('keeps search results out of the index', () => {
    const seo = buildBrowseSeo(state({ searchKeyword: 'moonlight' }));

    expect(seo.noindex).toBe(true);
    expect(seo.title).toBe('Search: "moonlight"');
  });

  it('words the sentence without the clause when no score has loaded yet', () => {
    const seo = buildBrowseSeo(state({ activeTab: 'artists' }));

    expect(seo.description).toBe(
      'Discover 3000+ piano scores by composer, from classical to contemporary, with interactive practice features.'
    );
  });

  it('drops the artist clause on a genre page with no scores loaded', () => {
    const seo = buildBrowseSeo(state({ selectedGenre: { genre: { name: 'blues', slug: 'blues' } } }));

    expect(seo.description).not.toContain(' by ');
    expect(seo.description).toContain('Browse and practice Blues piano scores on PianoML');
  });
});
