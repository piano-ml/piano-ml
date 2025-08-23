import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { MusicbrainzService, MusicBrainzWorksResponse } from './musicbrainz.service';

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
