import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { Subject } from 'rxjs';
import { SeoService } from '../../../shared/seo';
import { provideTesting } from '../../../testing/test-providers';
import { BlogService } from '../../services/blog.service';
import { BlogPostComponent } from './blog-post.component';

const POST_HTML =
  '<h1>New feature: Play with Accompaniment</h1>' +
  '<p>You can now practice one hand while PianoML plays the other one for you, at your own tempo.</p>';

describe('BlogPostComponent', () => {
  let fixture: ComponentFixture<BlogPostComponent>;
  let el: HTMLElement;
  let post: Subject<string>;
  let getPost: ReturnType<typeof vi.spyOn>;
  let seoUpdate: ReturnType<typeof vi.spyOn>;
  let slug: string | null;

  function render() {
    fixture = TestBed.createComponent(BlogPostComponent);
    el = fixture.nativeElement;
    fixture.detectChanges();
  }
  const article = () => el.querySelector('.blog-post') as HTMLElement;

  beforeEach(async () => {
    slug = 'just-play-along';
    await TestBed.configureTestingModule({
      imports: [BlogPostComponent],
      providers: [
        ...provideTesting(),
        { provide: ActivatedRoute, useFactory: () => ({ snapshot: { paramMap: convertToParamMap(slug ? { slug } : {}) } }) },
      ],
    }).compileComponents();
    post = new Subject<string>();
    getPost = vi.spyOn(TestBed.inject(BlogService), 'getPost').mockReturnValue(post);
    seoUpdate = vi.spyOn(TestBed.inject(SeoService), 'update').mockImplementation(() => undefined);
  });

  it('loads the post named in the URL and shows its HTML', () => {
    render();
    expect(getPost).toHaveBeenCalledWith('just-play-along');
    expect(article().innerHTML).toBe('');

    post.next(POST_HTML);
    fixture.detectChanges();
    expect(article().querySelector('h1')?.textContent).toBe('New feature: Play with Accompaniment');
    expect(article().querySelector('p')?.textContent).toContain('practice one hand');
  });

  it('sets the page title and description from the post', () => {
    render();
    post.next(POST_HTML);
    fixture.detectChanges();
    expect(seoUpdate).toHaveBeenCalledWith({
      title: 'New feature: Play with Accompaniment',
      description: 'You can now practice one hand while PianoML plays the other one for you, at your own tempo.',
      type: 'article',
    });
  });

  it('never runs scripts or inline handlers from the markdown', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined); // Angular reports what it sanitized
    render();
    post.next('<h1>Hi</h1><script>window.__pwned = true</script><img src="x" onerror="window.__pwned = true">');
    fixture.detectChanges();
    expect(article().querySelector('script')).toBeNull();
    expect(article().querySelector('img')?.getAttribute('onerror')).toBeNull();
    expect((window as unknown as { __pwned?: boolean }).__pwned).toBeUndefined();
  });

  it('loads nothing without a slug', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    slug = null;
    render();
    expect(getPost).not.toHaveBeenCalled();
    expect(article().innerHTML).toBe('');
    expect(seoUpdate).not.toHaveBeenCalled();
  });
});
