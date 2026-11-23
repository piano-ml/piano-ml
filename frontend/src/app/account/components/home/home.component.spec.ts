import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { BehaviorSubject } from 'rxjs';
import { vi } from 'vitest';

import { AccountHomeComponent } from './home.component';
import { AuthService } from '../../services/auth.service';
import { BreadcrumbService } from '../../../shared/services/breadcrumb.service';
import { ACCOUNT_TABS } from './account-tabs';

@Component({ standalone: true, template: '<p data-testid="tab-content">content</p>' })
class TabStubComponent {}

@Component({ standalone: true, template: '' })
class LoginStubComponent {}

describe('AccountHomeComponent — tabs', () => {
  let loggedIn: BehaviorSubject<boolean>;
  let harness: RouterTestingHarness;
  let breadcrumbs: BreadcrumbService;

  async function setup(url = '/account') {
    await TestBed.configureTestingModule({
      providers: [
        provideRouter([
          {
            path: 'account',
            component: AccountHomeComponent,
            children: [
              { path: '', redirectTo: ACCOUNT_TABS[0].path, pathMatch: 'full' },
              ...ACCOUNT_TABS.map(({ path, label }) => ({ path, component: TabStubComponent, data: { breadcrumb: label } })),
            ],
          },
          { path: 'account/login', component: LoginStubComponent },
        ]),
        { provide: AuthService, useValue: { isLoggedIn: loggedIn } },
      ],
    }).compileComponents();
    breadcrumbs = TestBed.inject(BreadcrumbService);
    harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(url);
  }

  const el = () => harness.routeNativeElement as HTMLElement;
  const tab = (id: string) => el().querySelector<HTMLAnchorElement>(`[data-testid="tab-${id}"]`)!;

  beforeEach(() => {
    loggedIn = new BehaviorSubject(true);
  });

  it('lists the tabs in order and opens "My Playlists" by default', async () => {
    await setup();
    const labels = [...el().querySelectorAll('nav a')].map(a => a.textContent!.trim());
    expect(labels).toEqual(['My Playlists', 'My Scores', 'Practice', 'AI', 'My Account']);
    expect(TestBed.inject(Router).url).toBe('/account/playlists');
    expect(tab('playlists').getAttribute('aria-current')).toBe('page');
    expect(tab('me').getAttribute('aria-current')).toBeNull();
    expect(el().querySelector('[data-testid="tab-content"]')).not.toBeNull();
  });

  it('the breadcrumb follows the open tab', async () => {
    const current = () => {
      let items: { label: string; path?: string }[] = [];
      breadcrumbs.items$.subscribe(value => (items = value)).unsubscribe();
      return items;
    };
    await setup('/account/ai');
    expect(current()).toEqual([{ label: 'AI', path: '/account/ai' }]);
    await harness.navigateByUrl('/account/me');
    expect(current()).toEqual([{ label: 'My Account', path: '/account/me' }]);
  });

  it('each tab links to its own route', async () => {
    await setup('/account/scores');
    expect(tab('scores').getAttribute('href')).toBe('/account/scores');
    expect(tab('me').getAttribute('href')).toBe('/account/me');
    expect(tab('scores').getAttribute('aria-current')).toBe('page');
    expect(tab('me').getAttribute('aria-current')).toBeNull();
  });

  it('sends a logged-out visitor to login, remembering the tab', async () => {
    loggedIn.next(false);
    await setup('/account/ai');
    await harness.fixture.whenStable();
    const router = TestBed.inject(Router);
    expect(router.url).toBe(`/account/login?returnUrl=${encodeURIComponent('/account/ai')}`);
  });

  it('goes to login when the session ends while on the page', async () => {
    await setup();
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    loggedIn.next(false);
    expect(navigate).toHaveBeenCalledWith(['/account/login'], expect.objectContaining({ queryParams: expect.any(Object) }));
  });
});
