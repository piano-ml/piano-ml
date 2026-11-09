import { SITE, clampDescription, pageTitle } from './seo.model';

describe('pageTitle', () => {
  it('appends the site suffix', () => {
    expect(pageTitle('Piano Scale Exercises')).toBe(`Piano Scale Exercises${SITE.titleSuffix}`);
  });

  it('does not repeat the site name when the title already carries it', () => {
    expect(pageTitle('PianoML: Learn Piano')).toBe('PianoML: Learn Piano');
  });

  it('falls back to the default title', () => {
    expect(pageTitle('   ')).toBe(SITE.defaultTitle);
  });
});

describe('clampDescription', () => {
  it('collapses whitespace', () => {
    expect(clampDescription('  two\n  lines ')).toBe('two lines');
  });

  it('cuts on a word boundary and keeps within the limit', () => {
    const long = 'Practice piano scales and arpeggios with interactive exercises on PianoML today';
    const clamped = clampDescription(long, 40);

    expect(clamped.length).toBeLessThanOrEqual(40);
    expect(clamped).toBe('Practice piano scales and arpeggios…');
  });

  it('leaves a short description alone', () => {
    expect(clampDescription('Short enough')).toBe('Short enough');
  });
});
