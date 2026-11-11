import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { of } from 'rxjs';
import { provideSeo } from './seo-router.effect';
import { SITE } from './seo.model';
import { SeoService } from './seo.service';

@Component({ template: '' })
class PageComponent {}

describe('SeoRouterEffect (provideSeo)', () => {
  let harness: RouterTestingHarness;
  let seo: SeoService;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      providers: [
        provideSeo(),
        provideRouter([
          {
            path: 'library',
            data: { breadcrumb: 'Library', seo: { title: 'Library', description: 'Browse scores' } },
            children: [
              { path: 'genres', component: PageComponent, data: { breadcrumb: 'Genres', seo: { title: 'Genres' } } },
              { path: '', component: PageComponent },
            ],
          },
          {
            path: 'score/:slug',
            component: PageComponent,
            resolve: { score: () => of({ title: 'Happy Birthday' }) },
            data: { breadcrumb: '@score.title' },
          },
          { path: '**', component: PageComponent, data: { breadcrumb: 'Not found', seo: { noindex: true } } },
        ]),
      ],
    });
    seo = TestBed.inject(SeoService);
    vi.spyOn(seo, 'setRouteSeo');
    vi.spyOn(seo, 'setGraph');
    vi.spyOn(seo, 'resetOverride');
    harness = await RouterTestingHarness.create();
  });

  const breadcrumbTrail = () => {
    const graph = vi.mocked(seo.setGraph).mock.calls.at(-1)![0][0];
    return graph.itemListElement.map((item: { name: string; item: string }) => [item.name, new URL(item.item).pathname]);
  };

  it("merges a parent route's SEO data with its child's", async () => {
    await harness.navigateByUrl('/library/genres');
    expect(seo.setRouteSeo).toHaveBeenLastCalledWith({ title: 'Genres', description: 'Browse scores' }, '/library/genres');
  });

  it('publishes the breadcrumb trail as structured data', async () => {
    await harness.navigateByUrl('/library/genres');
    expect(breadcrumbTrail()).toEqual([[SITE.name, '/'], ['Library', '/library'], ['Genres', '/library/genres']]);
  });

  it('resolves breadcrumb labels from resolved data', async () => {
    await harness.navigateByUrl('/score/happy-birthday');
    expect(breadcrumbTrail().at(-1)).toEqual(['Happy Birthday', '/score/happy-birthday']);
    expect(seo.setRouteSeo).toHaveBeenLastCalledWith(undefined, '/score/happy-birthday'); // site defaults
  });

  it('leaves unknown URLs out of the trail', async () => {
    await harness.navigateByUrl('/nowhere');
    expect(seo.setGraph).toHaveBeenLastCalledWith([undefined]); // empty trail: no breadcrumb at all
    expect(seo.setRouteSeo).toHaveBeenLastCalledWith({ noindex: true }, '/nowhere');
  });

  it("drops the previous page's override when a navigation starts", async () => {
    await harness.navigateByUrl('/library');
    vi.mocked(seo.resetOverride).mockClear();
    await harness.navigateByUrl('/library/genres');
    expect(seo.resetOverride).toHaveBeenCalledOnce();
  });
});
