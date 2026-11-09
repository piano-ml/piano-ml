import { postSeo } from './blog-post.seo';

describe('postSeo', () => {
  it('takes the title from the first heading and the description from the first real paragraph', () => {
    const seo = postSeo(
      '<h1>Burgmüller <em>Op. 100</em> &amp; friends</h1><p>Short.</p><p>Twenty-five progressive studies for the developing pianist.</p>',
      'burgmuller'
    );

    expect(seo.title).toBe('Burgmüller Op. 100 & friends');
    expect(seo.description).toBe('Twenty-five progressive studies for the developing pianist.');
    expect(seo.type).toBe('article');
  });

  it('falls back to the image alt text for an image-only heading', () => {
    expect(postSeo('<h1><img src="cover.webp" alt="Czerny studies"></h1>', 'czerny').title).toBe('Czerny studies');
  });

  it('falls back to the slug when there is no heading', () => {
    const seo = postSeo('<p>No heading here at all, just a paragraph of prose.</p>', 'thanks-and-acknowledgments');

    expect(seo.title).toBe('Thanks and acknowledgments');
  });

  it('has no description when the post has no usable paragraph', () => {
    expect(postSeo('<h1>Title</h1><p>Too short.</p>', 'slug').description).toBeUndefined();
  });
});
