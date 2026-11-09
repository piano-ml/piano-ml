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

    expect(seo.noindex).toBeTrue();
    expect(seo.title).toBe('Search: "moonlight"');
  });

  it('falls back to generic wording when no score has loaded yet', () => {
    expect(buildBrowseSeo(state({ activeTab: 'artists' })).description).toContain('classical, jazz and contemporary');
  });
});
