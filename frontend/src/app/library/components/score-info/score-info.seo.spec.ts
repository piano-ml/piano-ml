import type { ScoreApiInfo } from '../../../core/api';
import { buildScoreSeo } from './score-info.seo';

const score = {
  title: 'Ode to Joy',
  author: 'Beethoven',
  genre: 'classical',
  immutableSlug: 'beethoven-ode-to-joy'
} as ScoreApiInfo;

describe('buildScoreSeo', () => {
  it('titles the page after the composer and the piece', () => {
    const seo = buildScoreSeo(score, 'any-slug');

    expect(seo.title).toBe('Beethoven - Ode to Joy');
    expect(seo.canonical).toBe('/score/beethoven-ode-to-joy');
    expect(seo.type).toBe('music.song');
  });

  it("prefers the score's own description", () => {
    const seo = buildScoreSeo({ ...score, description: 'Written in 1824.' }, 'any-slug');

    expect(seo.description).toBe('Written in 1824.');
  });

  it('writes a per-score description when the score has none', () => {
    const seo = buildScoreSeo(score, 'any-slug');

    expect(seo.description).toContain('Ode to Joy');
    expect(seo.description).toContain('Beethoven');
    expect(seo.description).toContain('classical piano score');
  });

  it('keeps a missing score out of the index', () => {
    expect(buildScoreSeo(null, 'any-slug').noindex).toBeTrue();
  });
});
