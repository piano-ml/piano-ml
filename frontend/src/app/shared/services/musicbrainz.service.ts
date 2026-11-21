import { Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Observable, throwError, timer } from 'rxjs';
import { catchError, retry } from 'rxjs/operators';

// Interfaces pour les réponses de l'API MusicBrainz
export interface MusicBrainzWork {
  id: string;
  score: number;
  title: string;
  type?: string;
  language?: string;
  iswcs?: string[];
  aliases?: MusicBrainzAlias[];
  relations?: MusicBrainzRelation[];
  languages?: string[];
  disambiguation?: string;
}

export interface MusicBrainzAlias {
  'sort-name': string;
  name: string;
  locale: string | null;
  type: string | null;
  primary: boolean | null;
  'begin-date': string | null;
  'end-date': string | null;
}

export interface MusicBrainzRelation {
  type: string;
  'type-id': string;
  direction: 'forward' | 'backward';
  artist?: MusicBrainzArtist;
  recording?: MusicBrainzRecording;
}

export interface MusicBrainzArtist {
  id: string;
  name: string;
  'sort-name': string;
  disambiguation?: string;
}

export interface MusicBrainzRecording {
  id: string;
  title: string;
  video: boolean | null;
}

export interface MusicBrainzWorksResponse {
  created: string;
  count: number;
  offset: number;
  works: MusicBrainzWork[];
}

export interface MusicBrainzArtistsResponse {
  created: string;
  count: number;
  offset: number;
  artists: MusicBrainzArtistDetailed[];
}

export interface MusicBrainzArtistDetailed {
  id: string;
  type?: string;
  'type-id'?: string;
  score: number;
  name: string;
  'sort-name': string;
  country?: string;
  area?: {
    id: string;
    name: string;
    'sort-name': string;
    'type-id'?: string;
  };
  'begin-area'?: {
    id: string;
    name: string;
    'sort-name': string;
  };
  'life-span'?: {
    begin?: string;
    end?: string;
    ended?: boolean;
  };
  disambiguation?: string;
  aliases?: MusicBrainzAlias[];
  tags?: Array<{
    count: number;
    name: string;
  }>;
  gender?: string;
  'gender-id'?: string;
}

export interface MusicBrainzSearchParams {
  query: string;
  limit?: number;
  offset?: number;
  format?: 'json' | 'xml';
}

/**
 * Quotes a value as a Lucene phrase for the MusicBrainz search API. Backslashes are escaped together with
 * quotes: escaping only `"` would let a trailing `\` escape the closing quote and leak the rest of the
 * input into the query syntax.
 */
export function luceneQuote(value: string): string {
  return `"${value.replace(/[\\"]/g, '\\$&')}"`;
}

/**
 * MusicBrainz answers 503 to more than about one request per second from an address (and many visitors, or CI
 * runners, can share one): such answers, a 429, a gateway error or a network failure are retried after 1, 2, 4
 * and 8 seconds (a little random spread, so that clients do not retry in step), or after the Retry-After the
 * server asks for when it is longer, up to MAX_MS.
 */
export const MUSICBRAINZ_RETRY = { retries: 4, baseMs: 1000, maxMs: 10_000, jitter: 0.2 };
const RETRYABLE_STATUS = new Set([0, 429, 502, 503, 504]);

/** How long before retry number `attempt` (1-based) after `error`, or null when it is not worth retrying. */
export function musicBrainzRetryDelay(error: unknown, attempt: number, random: () => number = Math.random): number | null {
  if (!(error instanceof HttpErrorResponse) || !RETRYABLE_STATUS.has(error.status)) return null;
  const backoff = MUSICBRAINZ_RETRY.baseMs * 2 ** (attempt - 1) * (1 + MUSICBRAINZ_RETRY.jitter * random());
  const retryAfter = Number(error.headers?.get('Retry-After')) * 1000;
  return Math.round(Math.min(MUSICBRAINZ_RETRY.maxMs, Math.max(backoff, Number.isFinite(retryAfter) ? retryAfter : 0)));
}

/** Retries a MusicBrainz request with exponential backoff (see MUSICBRAINZ_RETRY). */
function retryWithBackoff<T>() {
  return retry<T>({
    count: MUSICBRAINZ_RETRY.retries,
    delay: (error, attempt) => {
      const ms = musicBrainzRetryDelay(error, attempt);
      return ms === null ? throwError(() => error) : timer(ms);
    },
  });
}

@Injectable({
  providedIn: 'root'
})
export class MusicbrainzService {
  private readonly baseUrl = 'https://musicbrainz.org/ws/2';
  private readonly userAgent = 'PianoML-Frontend/1.0 (https://pianoml.org)';

  constructor(private http: HttpClient) {}

  /**
   * Search for works in MusicBrainz
   * @param searchParams Search parameters
   * @returns Observable of MusicBrainz works response
   */
  searchWorks(searchParams: MusicBrainzSearchParams): Observable<MusicBrainzWorksResponse> {
    let params = new HttpParams()
      .set('query', searchParams.query)
      .set('fmt', searchParams.format || 'json')
      .set('limit', (searchParams.limit || 25).toString())
      .set('offset', (searchParams.offset || 0).toString());

    const headers = {
      //'User-Agent': this.userAgent, // TODO Refused to set unsafe header "User-Agent"
      'Accept': 'application/json'
    };

    return this.http.get<MusicBrainzWorksResponse>(`${this.baseUrl}/work`, {
      params,
      headers
    }).pipe(
      retryWithBackoff(),
      catchError(this.handleError<MusicBrainzWorksResponse>('searchWorks'))
    );
  }

  /**
   * Search for works by title
   * @param title The title to search for
   * @param limit Maximum number of results (default: 25)
   * @param offset Pagination offset (default: 0)
   * @returns Observable of MusicBrainz works response
   */
  searchWorksByTitle(title: string, limit: number = 25, offset: number = 0): Observable<MusicBrainzWorksResponse> {
    const query = luceneQuote(title);
    return this.searchWorks({ query, limit, offset });
  }

  /**
   * Search for works by artist and title
   * @param artist The artist name
   * @param title The work title
   * @param limit Maximum number of results (default: 25)
   * @param offset Pagination offset (default: 0)
   * @returns Observable of MusicBrainz works response
   */
  searchWorksByArtistAndTitle(artist: string, title: string, limit: number = 25, offset: number = 0): Observable<MusicBrainzWorksResponse> {
    const query = `artist:${luceneQuote(artist)} AND work:${luceneQuote(title)}`;
    return this.searchWorks({ query, limit, offset });
  }

  /**
   * Search for artists in MusicBrainz
   * @param searchParams Search parameters
   * @returns Observable of MusicBrainz artists response
   */
  searchArtists(searchParams: MusicBrainzSearchParams): Observable<MusicBrainzArtistsResponse> {
    let params = new HttpParams()
      .set('query', searchParams.query)
      .set('fmt', searchParams.format || 'json')
      .set('limit', (searchParams.limit || 25).toString())
      .set('offset', (searchParams.offset || 0).toString());

    const headers = {
      'Accept': 'application/json'
    };

    return this.http.get<MusicBrainzArtistsResponse>(`${this.baseUrl}/artist`, {
      params,
      headers
    }).pipe(
      retryWithBackoff(),
      catchError(this.handleError<MusicBrainzArtistsResponse>('searchArtists'))
    );
  }

  /**
   * Search for artists by name
   * @param name The artist name to search for
   * @param limit Maximum number of results (default: 25)
   * @param offset Pagination offset (default: 0)
   * @returns Observable of MusicBrainz artists response
   */
  searchArtistsByName(name: string, limit: number = 25, offset: number = 0): Observable<MusicBrainzArtistsResponse> {
    const query = `artist:${luceneQuote(name)}`;
    return this.searchArtists({ query, limit, offset });
  }

  /**
   * Get composers from a work's relations
   * @param work The MusicBrainz work
   * @returns Array of composer names
   */
  getComposers(work: MusicBrainzWork): string[] {
    if (!work.relations) return [];
    
    return work.relations
      .filter(rel => rel.type === 'composer' && rel.artist)
      .map(rel => rel.artist!.name);
  }

  /**
   * Get recordings from a work's relations
   * @param work The MusicBrainz work
   * @returns Array of recordings
   */
  getRecordings(work: MusicBrainzWork): MusicBrainzRecording[] {
    if (!work.relations) return [];
    
    return work.relations
      .filter(rel => rel.type === 'performance' && rel.recording)
      .map(rel => rel.recording!);
  }

  /**
   * Get lyricists from a work's relations
   * @param work The MusicBrainz work
   * @returns Array of lyricist names
   */
  getLyricists(work: MusicBrainzWork): string[] {
    if (!work.relations) return [];
    
    return work.relations
      .filter(rel => rel.type === 'lyricist' && rel.artist)
      .map(rel => rel.artist!.name);
  }

  /**
   * Get the primary language of a work
   * @param work The MusicBrainz work
   * @returns Language code or 'unknown'
   */
  getPrimaryLanguage(work: MusicBrainzWork): string {
    if (work.language) return work.language;
    if (work.languages && work.languages.length > 0) return work.languages[0];
    return 'unknown';
  }

  /**
   * Filter works by type
   * @param works Array of works
   * @param type Work type to filter by
   * @returns Filtered array of works
   */
  filterByType(works: MusicBrainzWork[], type: string): MusicBrainzWork[] {
    return works.filter(work => work.type === type);
  }

  /**
   * Get songs only (filter out other work types)
   * @param works Array of works
   * @returns Array of song works
   */
  getSongsOnly(works: MusicBrainzWork[]): MusicBrainzWork[] {
    return this.filterByType(works, 'Song');
  }

  /**
   * Sort works by relevance score (descending)
   * @param works Array of works
   * @returns Sorted array of works
   */
  sortByRelevance(works: MusicBrainzWork[]): MusicBrainzWork[] {
    return [...works].sort((a, b) => b.score - a.score);
  }

  /**
   * Handle HTTP operation that failed
   * @param operation Name of the operation that failed
   * @param result Optional value to return as the observable result
   */
  private handleError<T>(operation = 'operation') {
    return (error: any): Observable<T> => {
      console.error(`${operation} failed:`, error);
      
      // Let the app keep running by returning an empty result
      throw error;
    };
  }
}
