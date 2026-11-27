import type { ScoreApiInfo, YoutubeVideoApiInfo } from '../../../core/api';
import { currentLocale, localizedUrl } from '../../../shared/i18n';
import type { SeoData } from '../../../shared/seo';

const UNKNOWN_AUTHOR = $localize`:@@seo.score.unknownArtist:Unknown Artist`;
const UNTITLED = $localize`:@@seo.score.untitled:Untitled`;

export interface ScoreSeoInput {
  score: ScoreApiInfo | null;
  slug: string | null;
  videos?: YoutubeVideoApiInfo[];
}

/** Builds the metadata for a single score page. */
export function buildScoreSeo({ score, slug, videos }: ScoreSeoInput): SeoData {
  if (!score) {
    return { title: $localize`:@@seo.score.title:Score`, noindex: true };
  }

  const author = (score.author || '').trim() || UNKNOWN_AUTHOR;
  const title = (score.title || '').trim() || UNTITLED;
  // The genre's name, as the score API gives it (no need for the 350 KB list of all genres)
  const genre = (score.genre || '').trim();
  const canonical = `/score/${score.immutableSlug || score.mutableSlug || slug}`;

  const composition = {
    '@context': 'https://schema.org',
    '@type': 'MusicComposition',
    name: title,
    composer: { '@type': 'Person', name: author },
    ...(genre ? { genre } : {}),
    ...(score.fullKey ? { musicalKey: score.fullKey } : {}),
    ...(score.duration ? { duration: isoDuration(score.duration) } : {}),
    ...(score.publicDomain ? { isAccessibleForFree: true } : {}),
    inLanguage: currentLocale(),
    url: localizedUrl(canonical)
  };

  return {
    title: `${author} - ${title}`,
    description: describe(score, author, title, genre),
    canonical,
    type: 'music.song',
    structuredData: [composition, ...(videos || []).map(video => videoStructuredData(video, title, author)).filter(Boolean)]
  };
}

/**
 * Prefers the score's own description, and otherwise writes one from what we
 * know — a shared fallback would give every score page the same snippet.
 */
function describe(score: ScoreApiInfo, author: string, title: string, genre: string): string {
  const own = (score.description || '').trim();
  if (own) return own;

  // Whole sentences, so each language words them its own way; never assembled from fragments.
  const practice = genre
    ? $localize`:@@seo.score.descriptionWithGenre:Practice ${title}:title: by ${author}:artist: on PianoML: an interactive ${genre}:genre: piano score with hands-separated practice, adjustable tempo and MIDI feedback.`
    : $localize`:@@seo.score.description:Practice ${title}:title: by ${author}:artist: on PianoML: an interactive piano score with hands-separated practice, adjustable tempo and MIDI feedback.`;
  const licence = score.publicDomain ? $localize`:@@seo.score.publicDomain:Free to download and public domain.` : '';

  return licence ? `${practice} ${licence}` : practice;
}

/**
 * The performance videos shown on the page, so they can surface in search. Search Console wants a description:
 * many YouTube videos have none, so one is written from the score.
 */
function videoStructuredData(video: YoutubeVideoApiInfo, title: string, author: string) {
  if (!video.videoId || !video.title) return null;
  const description = (video.description || '').trim()
    || $localize`:@@seo.score.videoDescription:Piano video of ${title}:title: by ${author}:artist:, to watch before practicing it on PianoML.`;

  return {
    '@context': 'https://schema.org',
    '@type': 'VideoObject',
    name: video.title,
    description,
    ...(video.thumbnailUrl ? { thumbnailUrl: video.thumbnailUrl } : {}),
    ...(video.publishedAt ? { uploadDate: video.publishedAt } : {}),
    ...creatorOf(video),
    embedUrl: `https://www.youtube.com/embed/${video.videoId}`,
    url: `https://www.youtube.com/watch?v=${video.videoId}`
  };
}

/**
 * The channel that published the video. Search Console wants a url on a creator, so it is left out when the
 * channel id is unknown (videos cached before the API returned it).
 */
function creatorOf(video: YoutubeVideoApiInfo) {
  if (!video.channelTitle || !video.channelId) return {};
  return {
    creator: {
      '@type': 'Person',
      name: video.channelTitle,
      url: `https://www.youtube.com/channel/${encodeURIComponent(video.channelId)}`
    }
  };
}

/** Seconds to an ISO 8601 duration, which is what schema.org expects. */
export function isoDuration(seconds: number): string {
  const total = Math.round(seconds);
  const minutes = Math.floor(total / 60);
  const rest = total % 60;

  return `PT${minutes ? `${minutes}M` : ''}${rest || !minutes ? `${rest}S` : ''}`;
}
