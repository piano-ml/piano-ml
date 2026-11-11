import { DOCUMENT } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Title } from '@angular/platform-browser';
import { SITE, clampDescription } from './seo.model';
import { SeoService } from './seo.service';

/** Writes the document's title, meta tags, canonical link and JSON-LD from route data and page overrides. */
describe('SeoService', () => {
  let seo: SeoService;
  let doc: Document;

  const meta = (attr: 'name' | 'property', key: string) =>
    [...doc.head.querySelectorAll(`meta[${attr}="${key}"]`)].map((m) => m.getAttribute('content'));
  const canonical = () => doc.head.querySelector('link[rel="canonical"]')?.getAttribute('href');
  const jsonLd = () => [...doc.head.querySelectorAll('script[data-seo-jsonld]')].map((s) => JSON.parse(s.textContent ?? ''));

  beforeEach(() => {
    seo = TestBed.inject(SeoService);
    doc = TestBed.inject(DOCUMENT);
    doc.head.querySelectorAll('link[rel="canonical"], script[data-seo-jsonld], meta[name="keywords"]').forEach((e) => e.remove());
  });

  it("applies a route's metadata, and site defaults for the rest", () => {
    seo.setRouteSeo({ title: 'Library', description: 'All the scores' }, '/library?tab=new');
    expect(TestBed.inject(Title).getTitle()).toContain('Library');
    expect(meta('name', 'description')).toEqual(['All the scores']);
    expect(meta('property', 'og:type')).toEqual(['website']);
    expect(meta('name', 'robots')).toEqual(['index, follow']);
    expect(meta('property', 'og:site_name')).toEqual([SITE.name]);
    expect(canonical()).toMatch(/\/library$/); // without the query string
  });

  it('uses the site description and image when the route has none', () => {
    seo.setRouteSeo(undefined, '/');
    expect(meta('name', 'description')).toEqual([clampDescription(SITE.defaultDescription)]);
    expect(meta('property', 'og:image')[0]).toContain(SITE.ogImage);
  });

  it('a page override wins over the route, whichever arrives first', () => {
    seo.update({ title: 'Happy Birthday', type: 'article' }); // the component resolved its data first
    seo.setRouteSeo({ title: 'Score', description: 'A score' }, '/score/x');
    expect(TestBed.inject(Title).getTitle()).toContain('Happy Birthday');
    expect(meta('property', 'og:type')).toEqual(['article']);
    expect(meta('name', 'description')).toEqual(['A score']); // not overridden: kept from the route
  });

  it('drops the override when a new navigation starts', () => {
    seo.update({ title: 'Old page' });
    seo.resetOverride();
    seo.setRouteSeo({ title: 'New page' }, '/new');
    expect(TestBed.inject(Title).getTitle()).toContain('New page');
  });

  it('marks pages that must not be indexed', () => {
    seo.setRouteSeo({ title: 'Account', noindex: true }, '/account');
    expect(meta('name', 'robots')).toEqual(['noindex, nofollow']);
  });

  it('honors an explicit canonical URL', () => {
    seo.setRouteSeo({ canonical: '/score/the-real-one' }, '/score/an-alias');
    expect(canonical()).toMatch(/\/score\/the-real-one$/);
  });

  it('collapses duplicate tags and removes legacy ones', () => {
    for (let i = 0; i < 2; i++) {
      const dup = doc.createElement('meta');
      dup.setAttribute('name', 'description');
      dup.setAttribute('content', 'stale');
      doc.head.appendChild(dup);
    }
    const keywords = doc.createElement('meta');
    keywords.setAttribute('name', 'keywords');
    doc.head.appendChild(keywords);
    seo.setRouteSeo({ description: 'Fresh' }, '/');
    expect(meta('name', 'description')).toEqual(['Fresh']);
    expect(meta('name', 'keywords')).toEqual([]);
  });

  it('renders the site graph plus the page structured data as JSON-LD', () => {
    seo.setGraph([{ '@type': 'BreadcrumbList' }, null]);
    seo.update({ structuredData: { '@type': 'MusicComposition', name: 'Happy Birthday' } });
    expect(jsonLd()).toEqual([{ '@type': 'BreadcrumbList' }, { '@type': 'MusicComposition', name: 'Happy Birthday' }]);
    seo.update({ structuredData: [{ '@type': 'A' }, { '@type': 'B' }] });
    expect(jsonLd().map((e) => e['@type'])).toEqual(['BreadcrumbList', 'A', 'B']); // replaced, not appended
  });

  it('reuses the existing canonical link', () => {
    seo.setRouteSeo({}, '/a');
    seo.setRouteSeo({}, '/b');
    expect(doc.head.querySelectorAll('link[rel="canonical"]').length).toBe(1);
    expect(canonical()).toMatch(/\/b$/);
  });
});
