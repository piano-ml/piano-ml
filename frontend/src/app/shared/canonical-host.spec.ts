import { canonicalRedirect } from './canonical-host';

describe('canonicalRedirect', () => {
  it('sends www.pianoml.org to the same path and query on pianoml.org', () => {
    expect(canonicalRedirect('www.pianoml.org', '/work/fur-elise?tempo=80')).toBe('https://pianoml.org/work/fur-elise?tempo=80');
    expect(canonicalRedirect('WWW.PianoML.org:443', '/')).toBe('https://pianoml.org/');
    expect(canonicalRedirect('www.pianoml.org, proxy.internal', '/fr/coach/authorize?request=abc'))
      .toBe('https://pianoml.org/fr/coach/authorize?request=abc');
  });

  it('serves every other host as it is', () => {
    expect(canonicalRedirect('pianoml.org', '/work/x')).toBeNull();
    expect(canonicalRedirect('staging.pianoml.org', '/')).toBeNull();
    expect(canonicalRedirect('localhost:4000', '/')).toBeNull();
    expect(canonicalRedirect(undefined, '/')).toBeNull();
  });

  it('never redirects to another site', () => {
    expect(canonicalRedirect('www.pianoml.org', '//evil.example/x')).toBe('https://pianoml.org/');
    expect(canonicalRedirect('www.pianoml.org', 'https://evil.example/')).toBe('https://pianoml.org/');
  });
});
