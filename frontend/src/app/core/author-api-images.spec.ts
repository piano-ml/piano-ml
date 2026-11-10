import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { AuthorService } from './api/api/author.service';
import { AuthorApiInfo } from './api/model/authorApiInfo';
import { BASE_PATH } from './api/variables';

describe('AuthorService (generated) image fields', () => {
  let service: AuthorService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [{ provide: BASE_PATH, useValue: 'http://api.test' }]
    });
    service = TestBed.inject(AuthorService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('exposes image and imageHq from GET /author/{mbid}', () => {
    const body: AuthorApiInfo = {
      mbid: 'm1',
      name: 'Chopin',
      image: 'https://img.example/a.jpg',
      imageHq: 'https://img.example/a-hq.jpg'
    };
    let received: AuthorApiInfo | undefined;

    service.authorMbidGet('m1').subscribe(a => (received = a));
    httpMock.expectOne('http://api.test/author/m1').flush(body);

    expect(received?.image).toBe('https://img.example/a.jpg');
    expect(received?.imageHq).toBe('https://img.example/a-hq.jpg');
  });

  it('accepts responses without images (backward compatible)', () => {
    let received: AuthorApiInfo | undefined;

    service.authorMbidGet('m2').subscribe(a => (received = a));
    httpMock.expectOne('http://api.test/author/m2').flush({ mbid: 'm2', name: 'Liszt' });

    expect(received?.name).toBe('Liszt');
    expect(received?.image).toBeUndefined();
    expect(received?.imageHq).toBeUndefined();
  });

  it('sends image fields on PUT only when set', () => {
    service.authorMbidPut('m3', { name: 'Ravel', imageHq: 'https://img.example/r-hq.jpg' }).subscribe();
    const req = httpMock.expectOne('http://api.test/author/m3');

    expect(req.request.method).toBe('PUT');
    expect(req.request.body.imageHq).toBe('https://img.example/r-hq.jpg');
    expect('image' in req.request.body).toBe(false);
    req.flush({});
  });
});
