import type { ScoreApiInfo } from '../../../core/api';
import { buildScoreSeo, isoDuration } from './score-info.seo';

const score = {
  title: 'Ode to Joy',
  author: 'Beethoven',
  genre: 'classical',
  immutableSlug: 'beethoven-ode-to-joy'
} as ScoreApiInfo;

describe('isoDuration', () => {
  it('formats seconds the way schema.org expects', () => {
    expect(isoDuration(200)).toBe('PT3M20S');
    expect(isoDuration(120)).toBe('PT2M');
    expect(isoDuration(45)).toBe('PT45S');
    expect(isoDuration(0)).toBe('PT0S');
  });
});

describe('buildScoreSeo', () => {
  it('titles the page after the composer and the piece', () => {
    const seo = buildScoreSeo({ score, slug: 'any-slug' });

    expect(seo.title).toBe('Beethoven - Ode to Joy');
    expect(seo.canonical).toBe('/score/beethoven-ode-to-joy');
    expect(seo.type).toBe('music.song');
  });

  it("prefers the score's own description", () => {
    const seo = buildScoreSeo({ score: { ...score, description: 'Written in 1824.' }, slug: 'any-slug' });

    expect(seo.description).toBe('Written in 1824.');
  });

  it('writes a per-score description when the score has none', () => {
    const seo = buildScoreSeo({ score, slug: 'any-slug' });

    expect(seo.description).toContain('Ode to Joy');
    expect(seo.description).toContain('Beethoven');
    expect(seo.description).toContain('classical piano score');
  });

  it('adds the key, the duration and the licence to the JSON-LD', () => {
    const seo = buildScoreSeo({
      score: { ...score, fullKey: 'C major', duration: 200, publicDomain: true },
      slug: 'any-slug'
    });
    const [composition] = seo.structuredData as any[];

    expect(composition.musicalKey).toBe('C major');
    expect(composition.duration).toBe('PT3M20S');
    expect(composition.isAccessibleForFree).toBe(true);
  });

  it('describes the page videos as VideoObjects', () => {
    const seo = buildScoreSeo({
      score,
      slug: 'any-slug',
      videos: [{ videoId: 'abc123', title: 'Ode to Joy on piano' }, { title: 'no id, skipped' }]
    });
    const entries = seo.structuredData as any[];

    expect(entries.length).toBe(2);
    expect(entries[1]['@type']).toBe('VideoObject');
    expect(entries[1].embedUrl).toBe('https://www.youtube.com/embed/abc123');
  });

  it('gives the video creator the url of its YouTube channel, and leaves it out without one', () => {
    const seo = buildScoreSeo({
      score,
      slug: 'any-slug',
      videos: [
        { videoId: 'a', title: 'With channel', channelTitle: 'Piano Channel', channelId: 'UC123' },
        { videoId: 'b', title: 'Cached before channel ids', channelTitle: 'Old Channel' }
      ]
    });
    const [, withChannel, withoutId] = seo.structuredData as any[];

    expect(withChannel.creator).toEqual({ '@type': 'Person', name: 'Piano Channel', url: 'https://www.youtube.com/channel/UC123' });
    expect(withoutId.creator).toBeUndefined();
  });

  it('gives every video a description: its own, or one written from the score', () => {
    const seo = buildScoreSeo({
      score,
      slug: 'any-slug',
      videos: [{ videoId: 'a', title: 'With text', description: 'A slow tutorial' }, { videoId: 'b', title: 'Empty', description: '  ' }]
    });
    const [, own, written] = seo.structuredData as any[];

    expect(own.description).toBe('A slow tutorial');
    expect(written.description).toContain(score.title as string);
    expect(written.description).toContain('PianoML');
  });

  it('keeps a missing score out of the index', () => {
    expect(buildScoreSeo({ score: null, slug: 'any-slug' }).noindex).toBe(true);
  });
});
