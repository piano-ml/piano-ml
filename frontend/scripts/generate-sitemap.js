const fs = require('fs');
const path = require('path');
const https = require('https');

const SITEMAP_PATH = path.join(__dirname, '../src/sitemap.xml');
const BASE_URL = 'https://pianoml.org';
const GENRE_API_URL = 'https://api.pianoml.org/score/genre/browse';
const AUTHOR_API_URL = 'https://api.pianoml.org/score/author/browse';
const SCORE_SEARCH_API_URL = 'https://api.pianoml.org/score/search';
const SCORE_PAGINATION_LIMIT = 100;

// Static URLs to include in the sitemap (app router compatible - no hash routes)
const staticUrls = [
  { loc: `${BASE_URL}/`, priority: '1.0' },
  { loc: `${BASE_URL}/library`, priority: '1' },

  { loc: `${BASE_URL}/exercises/scale/C/major/left_than_right`, priority: '1' },
  { loc: `${BASE_URL}/exercises/scale/G/major/intervals`, priority: '1' },
  { loc: `${BASE_URL}/exercises/scale/D/major/contrary_motion`, priority: '1' },
  { loc: `${BASE_URL}/exercises/scale/A/major/parallel_motion_in_octaves`, priority: '1' },
  { loc: `${BASE_URL}/exercises/agility/E/major/two_octave_arpeggios`, priority: '1' },
  { loc: `${BASE_URL}/exercises/agility/B/major/arpeggio_root_position`, priority: '1' },    
  { loc: `${BASE_URL}/blog/thanks-and-acknowledgments`, priority: '0.5' },
  
];

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
function generateSitemap(genres, authors, scores) {
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
  staticUrls.forEach(({ loc, priority }) => {
    allUrls.push({ loc, priority: parseFloat(priority), lastmod: currentDate });
  });



  console.log(`Processing ${scores.length} scores for sitemap...`);
  scores.forEach((score) => {
    //console.log(`Processing score: ${score.title} (slug: ${score.slug})`);
    const immutableSlug = score.immutableSlug || score.slug;
    if (immutableSlug) {
      // Use uploadedAt from API if available, otherwise fall back to currentDate
      const scoreLastMod = score.uploadedAt ? new Date(score.uploadedAt).toISOString() : currentDate;
      allUrls.push({
        loc: `${BASE_URL}/score/${immutableSlug}`,
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
        loc: `${BASE_URL}/library/authors/${encodeURIComponent(authorSlug)}`,
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
        loc: `${BASE_URL}/library/genres/${encodeURIComponent(genreSlug)}`,
        priority,
        lastmod: genreLastMod
      });
    }
  });

  // // Sort by priority (descending)
  allUrls.sort((a, b) => b.priority - a.priority);

  // Generate XML
  let xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" 
        xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" 
        xsi:schemaLocation="http://www.sitemaps.org/schemas/sitemap/0.9 
        http://www.sitemaps.org/schemas/sitemap/0.9/sitemap.xsd">
`;

  allUrls.forEach(({ loc, priority, lastmod }) => {
    xml += `  <url>
    <loc>${loc}</loc>
    <lastmod>${lastmod}</lastmod>
    <priority>${priority}</priority>
  </url>
`;
  });

  xml += `</urlset>`;
  
  return { xml, urls: allUrls };
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
    const { xml: sitemapXml, urls } = generateSitemap(genres, authors, scores);
    
    fs.writeFileSync(SITEMAP_PATH, sitemapXml, 'utf8');
    console.log(`✓ Sitemap generated successfully at ${SITEMAP_PATH}`);
    console.log(`✓ Total URLs: ${urls.length}`);
    console.log('\n📊 URLs by priority (sorted):');
    console.log('─'.repeat(80));
    

  } catch (error) {
    console.error('✗ Error generating sitemap:', error.message);
    process.exit(1);
  }

}


main();
