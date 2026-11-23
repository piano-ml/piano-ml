import { Component, Type } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router, RouterOutlet, Routes } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';

import { accountRoutes } from './account-routing.module';

/** A stand-in for a page: shows its name, with an outlet for its child routes. */
function stubOf(name: string): Type<unknown> {
  @Component({ imports: [RouterOutlet], template: `<p data-page>${name}</p><router-outlet />` })
  class PageStub {}
  return PageStub;
}

/** The account routes as they are (paths, order, redirects), each page replaced by a stub of the same name. */
function withStubs(routes: Routes): Routes {
  const stubs = new Map<Type<unknown>, Type<unknown>>();
  const stub = (component: Type<unknown>) => {
    // The test bundle may suffix class names (AccountHomeComponent2)
    if (!stubs.has(component)) stubs.set(component, stubOf(component.name.replace(/\d+$/, '')));
    return stubs.get(component)!;
  };
  const map = (list: Routes): Routes => list.map(route => ({
    ...route,
    ...(route.component ? { component: stub(route.component) } : {}),
    ...(route.children ? { children: map(route.children) } : {}),
  }));
  return map(routes);
}

describe('account routes', () => {
  let harness: RouterTestingHarness;

  beforeEach(async () => {
    TestBed.configureTestingModule({ providers: [provideRouter([{ path: 'account', children: withStubs(accountRoutes) }])] });
    harness = await RouterTestingHarness.create();
  });

  const pages = () => [...(harness.routeNativeElement as HTMLElement).querySelectorAll('[data-page]')].map(p => p.textContent);
  const url = () => TestBed.inject(Router).url;

  it.each([
    ['/account/playlists', 'AccountPlaylistsComponent'],
    ['/account/scores', 'AccountScoresComponent'],
    ['/account/practice', 'PracticeSummaryComponent'],
    ['/account/ai', 'CoachGrantsComponent'],
    ['/account/me', 'AccountMeComponent'],
  ])('%s shows its tab inside the account page', async (path, page) => {
    await harness.navigateByUrl(path);
    expect(url()).toBe(path);
    expect(pages()).toEqual(['AccountHomeComponent', page]);
  });

  it('shows My Playlists when coming from another tab', async () => {
    await harness.navigateByUrl('/account/scores');
    await harness.navigateByUrl('/account/playlists');
    expect(pages()).toEqual(['AccountHomeComponent', 'AccountPlaylistsComponent']);
  });

  it('shows a playlist on its own page, outside the tabs', async () => {
    await harness.navigateByUrl('/account/playlists/favorites');
    expect(pages()).toEqual(['PlaylistDetailComponent']);
  });

  it.each([
    ['/account', '/account/playlists'],
    ['/account/home', '/account/playlists'],
    ['/account/home/ai', '/account/ai'],
  ])('%s redirects to %s', async (from, to) => {
    await harness.navigateByUrl(from);
    expect(url()).toBe(to);
  });
});
