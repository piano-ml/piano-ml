import { breadcrumbStructuredData, resolveBreadcrumbLabel } from './breadcrumbs';
import { SITE } from './seo.model';

describe('breadcrumbStructuredData', () => {
  it('roots the trail at the site', () => {
    const data = breadcrumbStructuredData([
      { name: 'Library', url: '/library' },
      { name: 'Browse', url: '/library/genres' }
    ]);

    expect(data?.itemListElement.map(item => item.name)).toEqual([SITE.name, 'Library', 'Browse']);
    expect(data?.itemListElement.map(item => item.item)).toEqual([
      SITE.url,
      `${SITE.url}/library`,
      `${SITE.url}/library/genres`
    ]);
    expect(data?.itemListElement.map(item => item.position)).toEqual([1, 2, 3]);
  });

  it('emits nothing for a page with no trail', () => {
    expect(breadcrumbStructuredData([])).toBeUndefined();
  });
});

describe('resolveBreadcrumbLabel', () => {
  it('passes a plain label through', () => {
    expect(resolveBreadcrumbLabel('Library', {})).toBe('Library');
  });

  it('reads a @-prefixed label out of resolved route data', () => {
    expect(resolveBreadcrumbLabel('@score.title', { score: { title: 'Ode to Joy' } })).toBe('Ode to Joy');
  });

  it('gives up when the resolved data is not there yet', () => {
    expect(resolveBreadcrumbLabel('@score.title', {})).toBeUndefined();
    expect(resolveBreadcrumbLabel('@score.title', { score: {} })).toBeUndefined();
    expect(resolveBreadcrumbLabel(undefined, {})).toBeUndefined();
  });
});
