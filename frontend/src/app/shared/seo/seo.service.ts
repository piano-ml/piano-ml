import { DOCUMENT, Injectable, inject } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';
import { SITE, type SeoData, absoluteUrl, canonicalPath, clampDescription, pageTitle } from './seo.model';

type MetaKind = 'name' | 'property';

/**
 * Every tag this service owns. Rendering is exhaustive over this list: a tag
 * without a value for the current page is removed rather than left behind, so
 * metadata can never leak from one route into the next.
 */
const MANAGED_TAGS: ReadonlyArray<readonly [MetaKind, string]> = [
  ['name', 'description'],
  ['name', 'robots'],
  ['name', 'author'],
  ['name', 'application-name'],
  ['name', 'twitter:card'],
  ['name', 'twitter:title'],
  ['name', 'twitter:description'],
  ['name', 'twitter:image'],
  ['property', 'og:title'],
  ['property', 'og:description'],
  ['property', 'og:type'],
  ['property', 'og:url'],
  ['property', 'og:image'],
  ['property', 'og:site_name'],
  ['property', 'og:locale']
];

/** Tags we no longer emit, cleaned up wherever they are still hanging around. */
const LEGACY_TAGS: ReadonlyArray<readonly [MetaKind, string]> = [['name', 'keywords']];

const JSONLD_MARKER = 'data-seo-jsonld';

/**
 * Single writer for the document's title, meta tags, canonical link and JSON-LD.
 *
 * Two layers feed it: whatever the active route declares in `data.seo`, and an
 * optional per-page override pushed by a component once it knows what it is
 * showing. The override is dropped when a new navigation starts, and always
 * wins over the route layer regardless of which arrived first — a component
 * that resolves its data before `NavigationEnd` is not overwritten by the
 * route defaults landing afterwards.
 */
@Injectable({ providedIn: 'root' })
export class SeoService {
  private meta = inject(Meta);
  private title = inject(Title);
  private document = inject(DOCUMENT);

  private routeSeo: SeoData = {};
  private override: SeoData = {};
  private url = '/';

  /** Applies the metadata declared by the activated route. */
  setRouteSeo(data: SeoData | undefined, url: string): void {
    this.routeSeo = data ?? {};
    this.url = url;
    this.render();
  }

  /** Drops the previous page's override. Called when a navigation starts. */
  resetOverride(): void {
    this.override = {};
  }

  /**
   * Describes the current page from a component, once it has the data to do so.
   * Merges onto whatever the route already declared.
   */
  update(data: SeoData): void {
    this.override = { ...this.override, ...strip(data) };
    this.render();
  }

  private render(): void {
    const data: SeoData = { ...strip(this.routeSeo), ...strip(this.override) };

    const title = pageTitle(data.title);
    const description = clampDescription(data.description || SITE.defaultDescription);
    const image = absoluteUrl(data.image || SITE.ogImage);
    const canonical = absoluteUrl(data.canonical || canonicalPath(this.url));

    const values: Partial<Record<string, string>> = {
      description,
      robots: data.noindex ? 'noindex, nofollow' : 'index, follow',
      author: SITE.name,
      'application-name': SITE.name,
      'twitter:card': 'summary_large_image',
      'twitter:title': title,
      'twitter:description': description,
      'twitter:image': image,
      'og:title': title,
      'og:description': description,
      'og:type': data.type || 'website',
      'og:url': canonical,
      'og:image': image,
      'og:site_name': SITE.name,
      'og:locale': SITE.locale
    };

    this.title.setTitle(title);

    for (const [kind, key] of MANAGED_TAGS) {
      const content = values[key];
      if (content) {
        this.setTag(kind, key, content);
      } else {
        this.removeTags(kind, key);
      }
    }

    for (const [kind, key] of LEGACY_TAGS) {
      this.removeTags(kind, key);
    }

    this.setCanonical(canonical);
    this.setStructuredData(data.structuredData);
  }

  /**
   * Writes a tag, collapsing any duplicates of it first. Duplicates are
   * possible in a hydrated document, and `Meta.removeTag` only ever drops the
   * first match.
   */
  private setTag(kind: MetaKind, key: string, content: string): void {
    this.removeTags(kind, key, 1);
    this.meta.updateTag(kind === 'name' ? { name: key, content } : { property: key, content });
  }

  private removeTags(kind: MetaKind, key: string, keep = 0): void {
    const tags = this.meta.getTags(`${kind}="${key}"`);
    for (const tag of tags.slice(keep)) {
      this.meta.removeTagElement(tag);
    }
  }

  private setCanonical(url: string): void {
    let link = this.document.querySelector<HTMLLinkElement>('link[rel="canonical"]');

    if (!link) {
      link = this.document.createElement('link');
      link.setAttribute('rel', 'canonical');
      this.document.head.appendChild(link);
    }

    link.setAttribute('href', url);
  }

  // biome-ignore lint/suspicious/noExplicitAny: JSON-LD is free-form by nature
  private setStructuredData(data: any | any[] | undefined): void {
    for (const script of Array.from(this.document.querySelectorAll(`script[${JSONLD_MARKER}]`))) {
      script.remove();
    }

    if (!data) return;

    for (const entry of (Array.isArray(data) ? data : [data]).filter(Boolean)) {
      const script = this.document.createElement('script');
      script.type = 'application/ld+json';
      script.setAttribute(JSONLD_MARKER, '');
      script.text = JSON.stringify(entry);
      this.document.head.appendChild(script);
    }
  }
}

/** Drops undefined entries so a partial update cannot blank out route values. */
function strip(data: SeoData): SeoData {
  return Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined)) as SeoData;
}
