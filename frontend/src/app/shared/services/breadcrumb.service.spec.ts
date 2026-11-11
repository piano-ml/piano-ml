import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { firstValueFrom, of } from 'rxjs';
import { BreadcrumbService } from './breadcrumb.service';

@Component({ template: '' })
class PageComponent {}

/** The header's breadcrumb trail, rebuilt from the routes' `breadcrumb` data after each navigation. */
describe('BreadcrumbService', () => {
  let service: BreadcrumbService;
  let harness: RouterTestingHarness;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          {
            path: 'library',
            data: { breadcrumb: 'Library' },
            children: [
              { path: 'genres/:slug', component: PageComponent, data: { breadcrumb: 'Genre' } },
              { path: '', component: PageComponent },
            ],
          },
          {
            path: 'score/:slug',
            component: PageComponent,
            resolve: { score: () => of({ info: { title: 'Happy Birthday' } }) },
            data: { breadcrumb: '@score.info.title' },
          },
          { path: 'missing/:slug', component: PageComponent, resolve: { score: () => of(null) }, data: { breadcrumb: '@score.title' } },
          { path: 'plain', component: PageComponent },
        ]),
      ],
    });
    service = TestBed.inject(BreadcrumbService);
    harness = await RouterTestingHarness.create();
  });

  const items = () => firstValueFrom(service.items$);

  it('is empty before any navigation', async () => {
    expect(await items()).toEqual([]);
  });

  it('lists each level with a label and the path to link to', async () => {
    await harness.navigateByUrl('/library/genres/jazz');
    expect(await items()).toEqual([
      { label: 'Library', path: '/library' },
      { label: 'Genre', path: '/library/genres/jazz' },
    ]);
  });

  it('reads @-labels from resolved route data', async () => {
    await harness.navigateByUrl('/score/happy-birthday');
    expect(await items()).toEqual([{ label: 'Happy Birthday', path: '/score/happy-birthday' }]);
  });

  it('copes with resolved data that is missing', async () => {
    await harness.navigateByUrl('/missing/x');
    expect(await items()).toEqual([{ label: null, path: '/missing/x' }]);
  });

  it('skips routes without a breadcrumb', async () => {
    await harness.navigateByUrl('/plain');
    expect(await items()).toEqual([]);
  });
});
