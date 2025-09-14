import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map, catchError } from 'rxjs/operators';

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

export interface MusicBrainzSearchParams {
  query: string;
  limit?: number;
  offset?: number;
  format?: 'json' | 'xml';
}

@Injectable({
  providedIn: 'root'
})
export class MusicbrainzService {
  private readonly baseUrl = 'https://musicbrainz.org/ws/2';
  private readonly userAgent = 'PianoML-Frontend/1.0 (https://ypianoml.org)';

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
    const query = `"${title.replace(/"/g, '\\"')}"`;
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
    const query = `artist:"${artist.replace(/"/g, '\\"')}" AND work:"${title.replace(/"/g, '\\"')}"`;
    return this.searchWorks({ query, limit, offset });
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
