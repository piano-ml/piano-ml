import { ComponentFixture, TestBed } from '@angular/core/testing';
import { BlogComponent } from './blog.component';

describe('BlogComponent', () => {
  let fixture: ComponentFixture<BlogComponent>;
  let el: HTMLElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [BlogComponent] }).compileComponents();
    fixture = TestBed.createComponent(BlogComponent);
    el = fixture.nativeElement;
    fixture.detectChanges();
  });

  const links = () => [...el.querySelectorAll('li.post a')] as HTMLAnchorElement[];

  it('titles the page', () => {
    expect(el.querySelector('h1')?.textContent).toBe('blog posts');
  });

  it('lists the posts with links to their pages', () => {
    expect(links().map((a) => [a.textContent, a.getAttribute('href')])).toEqual([
      ['# New feature: Play with Accompaniment', '/blog/just-play-along'],
    ]);
  });

  it('only links to posts that exist', async () => {
    for (const href of links().map((a) => a.getAttribute('href') ?? '')) {
      const slug = href.replace(/^\/blog\//, '');
      const response = await fetch(`/assets/blog/${slug}.md`);
      expect(response.ok, `${href}: assets/blog/${slug}.md answered ${response.status}`).toBe(true);
      expect((await response.text()).trim().length, `${href}: empty post`).toBeGreaterThan(0);
    }
  });
});
