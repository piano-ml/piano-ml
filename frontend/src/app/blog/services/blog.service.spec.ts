import { TestBed } from '@angular/core/testing';
import { HttpTestingController } from '@angular/common/http/testing';
import { firstValueFrom } from 'rxjs';
import { provideTesting } from '../../testing/test-providers';
import { BlogService } from './blog.service';

describe('BlogService', () => {
  let service: BlogService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: provideTesting() });
    service = TestBed.inject(BlogService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('fetches the post markdown as text from assets/blog/<slug>.md', () => {
    service.getPost('just-play-along').subscribe();
    const req = http.expectOne('assets/blog/just-play-along.md');
    expect(req.request.method).toBe('GET');
    expect(req.request.responseType).toBe('text');
    req.flush('');
  });

  it('renders the markdown to HTML', async () => {
    const post = firstValueFrom(service.getPost('demo'));
    http.expectOne('assets/blog/demo.md').flush(
      '# Play along\n\nPractice **both hands** with [the library](/library).\n\n- scales\n- arpeggios\n',
    );
    const html = await post;
    expect(html).toContain('<h1>Play along</h1>');
    expect(html).toContain('<strong>both hands</strong>');
    expect(html).toContain('<a href="/library">the library</a>');
    expect(html).toMatch(/<ul>\s*<li>scales<\/li>\s*<li>arpeggios<\/li>\s*<\/ul>/);
  });

  it('passes a missing post (404) on as an error', async () => {
    const post = firstValueFrom(service.getPost('nope'));
    http.expectOne('assets/blog/nope.md').flush('Not found', { status: 404, statusText: 'Not Found' });
    await expect(post).rejects.toMatchObject({ status: 404 });
  });
});
