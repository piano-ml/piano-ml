import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { luceneQuote, MusicbrainzService, MusicBrainzWorksResponse } from './musicbrainz.service';

describe('MusicbrainzService', () => {
  let service: MusicbrainzService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [MusicbrainzService]
    });
    service = TestBed.inject(MusicbrainzService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should search works', () => {
    const mockResponse: MusicBrainzWorksResponse = {
      created: '2025-08-17T11:54:25.372Z',
      count: 1,
      offset: 0,
      works: [
        {
          id: 'test-id',
          score: 100,
          title: 'Test Song',
          type: 'Song',
          language: 'eng'
        }
      ]
    };

    service.searchWorks({ query: 'test' }).subscribe(response => {
      expect(response).toEqual(mockResponse);
    });

    const req = httpMock.expectOne(request => 
      request.url === 'https://musicbrainz.org/ws/2/work' &&
      request.params.get('query') === 'test'
    );
    expect(req.request.method).toBe('GET');
    req.flush(mockResponse);
  });

  it('should search works by title', () => {
    const title = 'Redemption Song';
    
    service.searchWorksByTitle(title).subscribe();

    const req = httpMock.expectOne(request => 
      request.url === 'https://musicbrainz.org/ws/2/work' &&
      request.params.get('query') === `"${title}"`
    );
    expect(req.request.method).toBe('GET');
    req.flush({ created: '', count: 0, offset: 0, works: [] });
  });

  it('should search works by artist and title', () => {
    const artist = 'Bob Marley';
    const title = 'Redemption Song';
    
    service.searchWorksByArtistAndTitle(artist, title).subscribe();

    const req = httpMock.expectOne(request => 
      request.url === 'https://musicbrainz.org/ws/2/work' &&
      request.params.get('query') === `artist:"${artist}" AND work:"${title}"`
    );
    expect(req.request.method).toBe('GET');
    req.flush({ created: '', count: 0, offset: 0, works: [] });
  });
});

describe('MusicbrainzService artist search', () => {
  it('searchArtistsByName quotes the name safely in the artist query', () => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [MusicbrainzService],
    });
    const service = TestBed.inject(MusicbrainzService);
    const httpMock = TestBed.inject(HttpTestingController);

    service.searchArtistsByName('Bach\\', 5, 10).subscribe();

    const req = httpMock.expectOne(r => r.url.endsWith('/artist'));
    expect(req.request.params.get('query')).toBe('artist:"Bach\\\\"');
    expect(req.request.params.get('limit')).toBe('5');
    expect(req.request.params.get('offset')).toBe('10');
    req.flush({ created: '', count: 0, offset: 0, artists: [] });
    httpMock.verify();
  });
});

describe('luceneQuote', () => {
  it('wraps a plain value in quotes', () => {
    expect(luceneQuote('Für Elise')).toBe('"Für Elise"');
  });

  it('escapes embedded quotes', () => {
    expect(luceneQuote('The "Moonlight" Sonata')).toBe('"The \\"Moonlight\\" Sonata"');
  });

  it('escapes backslashes, so a trailing backslash cannot escape the closing quote', () => {
    expect(luceneQuote('Bach\\')).toBe('"Bach\\\\"');
  });

  it('cannot be broken out of with a backslash-quote sequence', () => {
    // Input: x\" OR artist:"y  -> every quote stays escaped inside one phrase.
    const quoted = luceneQuote('x\\" OR artist:"y');
    expect(quoted).toBe('"x\\\\\\" OR artist:\\"y"');
    const inner = quoted.slice(1, -1);
    // No unescaped quote inside the phrase: every " is preceded by an odd number of backslashes.
    for (const m of inner.matchAll(/(\\*)"/g)) {
      expect(m[1].length % 2).toBe(1);
    }
  });
});

describe('MusicbrainzService work helpers', () => {
  let service: MusicbrainzService;
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(MusicbrainzService);
  });

  const work = (overrides: Record<string, unknown>) => ({ id: 'w', title: 'T', score: 50, ...overrides }) as never;
  const YESTERDAY = work({
    relations: [
      { type: 'composer', artist: { id: 'a', name: 'Paul McCartney' } },
      { type: 'lyricist', artist: { id: 'a', name: 'Paul McCartney' } },
      { type: 'lyricist' }, // no artist: ignored
      { type: 'performance', recording: { id: 'r1', title: 'Yesterday (1965)' } },
    ],
  });

  it('extracts composers, lyricists and recordings from the relations', () => {
    expect(service.getComposers(YESTERDAY)).toEqual(['Paul McCartney']);
    expect(service.getLyricists(YESTERDAY)).toEqual(['Paul McCartney']);
    expect(service.getRecordings(YESTERDAY)).toEqual([{ id: 'r1', title: 'Yesterday (1965)' }]);
  });

  it('returns empty lists for a work without relations', () => {
    const bare = work({});
    expect([service.getComposers(bare), service.getLyricists(bare), service.getRecordings(bare)]).toEqual([[], [], []]);
  });

  it('finds the language, from one or several, or unknown', () => {
    expect(service.getPrimaryLanguage(work({ language: 'eng' }))).toBe('eng');
    expect(service.getPrimaryLanguage(work({ languages: ['fra', 'eng'] }))).toBe('fra');
    expect(service.getPrimaryLanguage(work({ languages: [] }))).toBe('unknown');
  });

  it('filters songs and sorts by relevance without mutating the input', () => {
    const works = [work({ id: '1', type: 'Song', score: 40 }), work({ id: '2', type: 'Opera', score: 90 }), work({ id: '3', type: 'Song', score: 80 })];
    expect(service.getSongsOnly(works).map((w: { id: string }) => w.id)).toEqual(['1', '3']);
    expect(service.filterByType(works, 'Opera').map((w: { id: string }) => w.id)).toEqual(['2']);
    expect(service.sortByRelevance(works).map((w: { id: string }) => w.id)).toEqual(['2', '3', '1']);
    expect(works.map((w: { id: string }) => w.id)).toEqual(['1', '2', '3']);
  });

  it('logs and rethrows failed requests', () => {
    const http = TestBed.inject(HttpTestingController);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    let failure: unknown;
    service.searchWorksByTitle('x').subscribe({ error: (e) => (failure = e) });
    http.expectOne(() => true).flush('down', { status: 503, statusText: 'Service Unavailable' });
    expect(failure).toMatchObject({ status: 503 });
    expect(console.error).toHaveBeenCalled();
  });
});

