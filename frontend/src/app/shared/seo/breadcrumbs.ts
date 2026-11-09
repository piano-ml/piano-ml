import { SITE } from './seo.model';

/**
 * Reads a route's `breadcrumb` data. A plain string is the label itself; a
 * `@`-prefixed one reads resolved route data, so `@score.title` is the title of
 * whatever the `score` resolver returned. Mirrors BreadcrumbService.
 */
export function resolveBreadcrumbLabel(spec: unknown, data: Record<string, unknown> | undefined): string | undefined {
  if (typeof spec !== 'string' || !spec) return undefined;
  if (!spec.startsWith('@')) return spec;

  const [root, ...rest] = spec.slice(1).split('.');
  // biome-ignore lint/suspicious/noExplicitAny: walking resolved data of unknown shape
  let value: any = data?.[root];
  for (const key of rest) {
    value = value?.[key];
  }

  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

export interface BreadcrumbEntry {
  name: string;
  url: string;
}

/**
 * A schema.org BreadcrumbList, rooted at the site itself. Returns undefined for
 * the home page, where a one-item trail says nothing.
 */
export function breadcrumbStructuredData(trail: BreadcrumbEntry[]) {
  if (trail.length === 0) return undefined;

  const items = [{ name: SITE.name, url: '/' }, ...trail];

  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: `${SITE.url}${item.url === '/' ? '' : item.url}`
    }))
  };
}
