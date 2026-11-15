const fs = require('fs');
const path = require('path');
const https = require('https');
const zlib = require('zlib');
const { readLocales, localizedPath } = require('./lib/i18n-config');

const SRC_DIR = path.join(__dirname, '../src');
const BASE_URL = 'https://pianoml.org';
// Search engines read at most 50,000 URLs or 50 MB per sitemap file: past either, one file per language.
const MAX_URLS_PER_FILE = 50000;
const MAX_BYTES_PER_FILE = 50 * 1024 * 1024;
const GENRE_API_URL = 'https://api.pianoml.org/score/genre/browse';
const AUTHOR_API_URL = 'https://api.pianoml.org/score/author/browse';
const SCORE_SEARCH_API_URL = 'https://api.pianoml.org/score/search';
const SCORE_PAGINATION_LIMIT = 100;
const BLOG_DIR = path.join(__dirname, '../src/assets/blog');
// Kept out of the index by robots.txt, so they do not belong in the sitemap.
const BLOG_EXCLUDED = ['help', 'legal'];

// Static pages to include in the sitemap, as app paths: each one is listed in every language.
// Every path here must match a real route, and the canonical the page emits.
const staticUrls = [
  { path: '/', priority: '1.0' },
  { path: '/library', priority: '1' },
  { path: '/library/artists', priority: '0.9' },
  { path: '/library/new', priority: '0.9' },
  { path: '/library/popular', priority: '0.9' },
  { path: '/summary', priority: '0.8' },
  { path: '/exercises', priority: '0.8' },
  { path: '/blog', priority: '0.8' },

  { path: '/exercises/scale/C/major/left_than_right', priority: '1' },
  { path: '/exercises/scale/G/major/intervals', priority: '1' },
  { path: '/exercises/scale/D/major/contrary_motion', priority: '1' },
  { path: '/exercises/scale/A/major/parallel_motion_in_octaves', priority: '1' },
  { path: '/exercises/agility/E/major/two_octave_arpeggios', priority: '1' },
  { path: '/exercises/agility/B/major/arpeggio_root_position', priority: '1' },
];

/**
 * Blog posts are markdown files served from assets, so the sitemap reads the
 * directory instead of listing them by hand.
 */
function blogUrls() {
  if (!fs.existsSync(BLOG_DIR)) {
    console.warn(`! Blog directory not found at ${BLOG_DIR}, skipping blog URLs`);
    return [];
  }

  return fs.readdirSync(BLOG_DIR)
    .filter(file => file.endsWith('.md'))
    .map(file => path.basename(file, '.md'))
    .filter(slug => !BLOG_EXCLUDED.includes(slug))
    // Posts are written in English only: the other languages show them noindex, so only English is listed.
    .map(slug => ({ path: `/blog/${slug}`, priority: '0.5', englishOnly: true }));
}

/**
 * Fetch data from API
 */
function fetchFromApi(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        try {
          const result = JSON.parse(data);
          resolve(result);
        } catch (error) {
          reject(new Error(`Failed to parse response from ${url}: ${error.message}`));
        }
      });
    }).on('error', (error) => {
      reject(new Error(`Failed to fetch from ${url}: ${error.message}`));
    });
  });
}

/**
 * Fetch all scores with pagination
 */
async function fetchAllScores() {
  const allScores = [];
  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    const url = `${SCORE_SEARCH_API_URL}?offset=${offset}&limit=${SCORE_PAGINATION_LIMIT}`;
    //console.log(`  Fetching scores: offset=${offset}, limit=${SCORE_PAGINATION_LIMIT}...`);
    process.stdout.write(".");
    const response = await fetchFromApi(url);
    const scores = Array.isArray(response) ? response : (response.scores || response.results || []) //.filter(s => s.version===0); // Ensure we have an array and filter out invalid entries  


    
    if (scores.length === 0) {
      hasMore = false;
    } else {
      allScores.push(...scores);
      offset += SCORE_PAGINATION_LIMIT;
      
      // Stop if we got less than the limit (last page)
      if (scores.length < SCORE_PAGINATION_LIMIT) {
        hasMore = false;
      }
    }
  }

  return allScores;
}

/**
 * Calculate priority based on count using cross multiplication (produit en croix)
 * Max count = 1.0, proportional scaling with minimum of 0.3
 * Multiplied by 2 and capped at 1.0 to smooth the distribution
 */
function calculatePriority(count, maxCount) {
  if (!count || !maxCount || maxCount === 0) return 0.3;
  // Cross multiplication: priority = (count / maxCount) * 1.0
  // Scale from 0.3 (minimum) to 1.0 (max count)
  const normalized = count / maxCount;
  const priority = 0.3 + (normalized * 0.7);
  // Multiply by 2 and cap at 1.0
  const smoothed = Math.min(priority * 2, 1.0);
  return Math.round(smoothed * 100) / 100; // Round to 2 decimal places
}

/**
 * Generate sitemap XML
 */
function generateSitemap(genres, authors, scores, locales = readLocales(), pages = [...staticUrls, ...blogUrls()]) {
  const currentDate = new Date().toISOString();
  
  // Genres to exclude from max calculation
  const excludedGenreSlugs = ['-traditional-', 'folk'];
  const excludedAuthorSlugs = ['-traditional-', 'anonymous','-traditional-'];
  
  // Calculate max counts excluding specific genres/authors
  const maxGenreCount = Math.max(...genres
    .filter(g => !excludedGenreSlugs.includes(g.genre?.slug || g.slug))
    .map(g => g.count || 0));
  const maxAuthorCount = Math.max(...authors
    .filter(a => !excludedAuthorSlugs.includes(a.author?.slug || a.slug))
    .map(a => a.count || 0));

  // Find which items have the max count for debugging
  const topGenre = genres.find(g => g.count === maxGenreCount && !excludedGenreSlugs.includes(g.genre?.slug || g.slug));
  const topAuthor = authors.find(a => a.count === maxAuthorCount && !excludedAuthorSlugs.includes(a.author?.slug || a.slug));

  console.log(`Max genre: "${topGenre?.genre?.name || topGenre?.name}" with count ${maxGenreCount}`);
  console.log(`Max author: "${topAuthor?.author?.name || topAuthor?.name}" with count ${maxAuthorCount}`);

  // Collect all URLs with their priorities
  const allUrls = [];

  // Add static URLs
  pages.forEach(({ path: pagePath, priority, englishOnly }) => {
    allUrls.push({ path: pagePath, priority: parseFloat(priority), lastmod: currentDate, ...(englishOnly && { englishOnly }) });
  });



  console.log(`Processing ${scores.length} scores for sitemap...`);
  scores.forEach((score) => {
    //console.log(`Processing score: ${score.title} (slug: ${score.slug})`);
    const immutableSlug = score.immutableSlug || score.slug;
    if (immutableSlug) {
      // Use uploaded_at from API if available, otherwise fall back to currentDate
      const scoreLastMod = score.uploaded_at ? new Date(score.uploaded_at).toISOString() : currentDate;
      allUrls.push({
        path: `/score/${immutableSlug}`,
        priority: 1,
        lastmod: scoreLastMod
      });
    }
  });

  // Add author URLs (using maxAuthorCount for scaling)
  authors.forEach((item) => {
    const authorSlug = item.author?.slug || item.slug || item.name;
    if (authorSlug) {
      // Fixed priority for excluded authors
      const priority = excludedAuthorSlugs.includes(authorSlug)
        ? 0.5
        : calculatePriority(item.count, maxAuthorCount);
      // Use updatedAt from API if available, otherwise fall back to currentDate
      const authorLastMod = item.updatedAt ? new Date(item.updatedAt).toISOString() : currentDate;
      allUrls.push({
        path: `/library/artists/${encodeURIComponent(authorSlug)}`,
        priority,
        lastmod: authorLastMod
      });
    }
  });

  // Add genre URLs (using maxGenreCount for scaling)
  genres.forEach((item) => {
    const genreSlug = item.genre?.slug || item.slug || item.name;
    if (genreSlug) {
      // Fixed priority for excluded genres
      const priority = excludedGenreSlugs.includes(genreSlug) 
        ? 0.5 
        : calculatePriority(item.count, maxGenreCount);
      // Use updatedAt from API if available, otherwise fall back to currentDate
      const genreLastMod = item.updatedAt ? new Date(item.updatedAt).toISOString() : currentDate;
      allUrls.push({
        path: `/library/genres/${encodeURIComponent(genreSlug)}`,
        priority,
        lastmod: genreLastMod
      });
    }
  });

  // // Sort by priority (descending)
  allUrls.sort((a, b) => b.priority - a.priority);

  return { files: renderSitemaps(allUrls, locales), urls: allUrls };
}

const escapeXml = (text) =>
  String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const URLSET_OPEN = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xhtml="http://www.w3.org/1999/xhtml">
`;

/**
 * One `<url>` per page and language. Every language version lists all of them as alternates, plus
 * `x-default` (the source language), mirroring the hreflang links the pages emit. English-only pages
 * (blog posts) are listed once, without alternates.
 */
function urlEntries(urls, locales) {
  const source = locales[0];
  const absolute = (pagePath, locale) => `${BASE_URL}${localizedPath(pagePath, locale)}`;

  return locales.map((locale) => {
    const entries = [];
    for (const { path: pagePath, priority, lastmod, englishOnly } of urls) {
      if (englishOnly && locale !== source) continue;

      const alternates = englishOnly
        ? ''
        : [...locales.map((other) => [other.code, absolute(pagePath, other)]), ['x-default', absolute(pagePath, source)]]
            .map(([hreflang, href]) => `\n    <xhtml:link rel="alternate" hreflang="${hreflang}" href="${escapeXml(href)}"/>`)
            .join('');

      entries.push(`  <url>
    <loc>${escapeXml(absolute(pagePath, locale))}</loc>${alternates}
    <lastmod>${lastmod}</lastmod>
    <priority>${priority}</priority>
  </url>
`);
    }
    return { locale, entries };
  });
}

/**
 * The sitemap file(s), keyed by file name: a single sitemap.xml while it fits the limits, otherwise
 * sitemap.xml as an index of one sitemap-<code>.xml.gz per language. Those are written gzipped (the
 * limits apply to the uncompressed size): every URL carries every language as an alternate, so with many
 * languages the plain files would weigh hundreds of MB in the image.
 */
function renderSitemaps(urls, locales, limits = { urls: MAX_URLS_PER_FILE, bytes: MAX_BYTES_PER_FILE }) {
  const perLocale = urlEntries(urls, locales);
  const all = perLocale.flatMap(({ entries }) => entries);
  const single = `${URLSET_OPEN}${all.join('')}</urlset>\n`;

  if (all.length <= limits.urls && Buffer.byteLength(single) <= limits.bytes) {
    return { 'sitemap.xml': single };
  }

  const files = {};
  const lastmod = new Date().toISOString();
  for (const { locale, entries } of perLocale) {
    files[`sitemap-${locale.code}.xml.gz`] = `${URLSET_OPEN}${entries.join('')}</urlset>\n`;
  }
  files['sitemap.xml'] = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${locales.map((locale) => `  <sitemap>
    <loc>${BASE_URL}/sitemap-${locale.code}.xml.gz</loc>
    <lastmod>${lastmod}</lastmod>
  </sitemap>
`).join('')}</sitemapindex>
`;
  return files;
}

/**
 * Main function
 */
async function main() {

  try {
    console.log('Fetching genres from API...');
    const genres = await fetchFromApi(GENRE_API_URL);
    console.log(`✓ Found ${genres.length} genres`);
    
    console.log('Fetching authors from API...');
    const authors = await fetchFromApi(AUTHOR_API_URL);
    console.log(`✓ Found ${authors.length} authors`);
    
    console.log('Fetching scores from API...');
    const scores = await fetchAllScores();

    console.log(`✓ Found ${scores.length} scores`);
    
    console.log('Generating sitemap...');
    const { files, urls } = generateSitemap(genres, authors, scores);

    // Per-language files left over from a previous, bigger run would otherwise still be served.
    for (const file of fs.readdirSync(SRC_DIR)) {
      if (/^sitemap-.+\.xml(\.gz)?$/.test(file) && !files[file]) fs.unlinkSync(path.join(SRC_DIR, file));
    }
    for (const [file, xml] of Object.entries(files)) {
      fs.writeFileSync(path.join(SRC_DIR, file), file.endsWith('.gz') ? zlib.gzipSync(xml, { level: 9 }) : xml);
      console.log(`✓ Sitemap generated successfully at src/${file}`);
    }
    console.log(`✓ Total URLs: ${urls.length}`);
    console.log('\n📊 URLs by priority (sorted):');
    console.log('─'.repeat(80));
    

  } catch (error) {
    console.error('✗ Error generating sitemap:', error.message);
    process.exit(1);
  }

}


if (require.main === module) main();

module.exports = { generateSitemap, renderSitemaps, staticUrls };
