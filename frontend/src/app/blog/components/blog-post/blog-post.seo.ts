import { type SeoData, clampDescription } from '../../../shared/seo';

/**
 * Posts are plain markdown with no front matter, so the metadata is read back
 * out of the rendered HTML: the first heading titles the page and the first
 * paragraph describes it.
 */
export function postSeo(html: string, slug: string): SeoData {
  return {
    title: extractHeading(html) || humanize(slug),
    description: extractFirstParagraph(html),
    type: 'article'
  };
}

function extractHeading(html: string): string | null {
  const heading = html.match(/<h1[^>]*>(.*?)<\/h1>/is)?.[1];
  if (!heading) return null;

  const text = stripTags(heading);
  if (text) return text;

  // Image-only headings — fall back to the alt text.
  return heading.match(/<img[^>]+alt=["']([^"']+)["']/i)?.[1] || null;
}

function extractFirstParagraph(html: string): string | undefined {
  for (const match of html.matchAll(/<p[^>]*>(.*?)<\/p>/gis)) {
    const text = stripTags(match[1]);
    if (text.length > 40) return clampDescription(text);
  }

  return undefined;
}

function stripTags(html: string): string {
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&(?:amp|lt|gt|quot|#39|nbsp);/g, entity => ENTITIES[entity] ?? ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&nbsp;': ' '
};

/** `thanks-and-acknowledgments` → `Thanks and acknowledgments`. */
function humanize(slug: string): string {
  const words = slug.replace(/[-_]+/g, ' ').trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}
