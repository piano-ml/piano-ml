import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { BehaviorSubject } from 'rxjs';
import { vi } from 'vitest';

import { AccountHomeComponent } from './home.component';
import { AuthService } from '../../services/auth.service';

@Component({ standalone: true, template: '<p data-testid="tab-content">content</p>' })
class TabStubComponent {}

@Component({ standalone: true, template: '' })
class LoginStubComponent {}

describe('AccountHomeComponent — tabs', () => {
  let loggedIn: BehaviorSubject<boolean>;
  let harness: RouterTestingHarness;

  async function setup(url = '/account/home') {
    await TestBed.configureTestingModule({
      providers: [
        provideRouter([
          {
            path: 'account/home',
            component: AccountHomeComponent,
            children: [
              { path: '', redirectTo: 'me', pathMatch: 'full' },
              ...['me', 'ai', 'practice', 'scores', 'playlists'].map(path => ({ path, component: TabStubComponent })),
            ],
          },
          { path: 'account/login', component: LoginStubComponent },
        ]),
        { provide: AuthService, useValue: { isLoggedIn: loggedIn } },
      ],
    }).compileComponents();
    harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(url);
  }

  const el = () => harness.routeNativeElement as HTMLElement;
  const tab = (id: string) => el().querySelector<HTMLAnchorElement>(`[data-testid="tab-${id}"]`)!;

  beforeEach(() => {
    loggedIn = new BehaviorSubject(true);
  });

  it('lists the tabs in order and opens "Me" by default', async () => {
    await setup();
    const labels = [...el().querySelectorAll('nav a')].map(a => a.textContent!.trim());
    expect(labels).toEqual(['Me', 'AI', 'Practice', 'My Scores', 'My Playlists']);
    expect(TestBed.inject(Router).url).toBe('/account/home/me');
    expect(tab('me').classList).toContain('border-emerald-500');
    expect(tab('ai').classList).not.toContain('border-emerald-500');
    expect(el().querySelector('[data-testid="tab-content"]')).not.toBeNull();
  });

  it('each tab links to its own route', async () => {
    await setup('/account/home/scores');
    expect(tab('scores').getAttribute('href')).toBe('/account/home/scores');
    expect(tab('playlists').getAttribute('href')).toBe('/account/home/playlists');
    expect(tab('scores').classList).toContain('border-emerald-500');
    expect(tab('me').classList).not.toContain('border-emerald-500');
  });

  it('sends a logged-out visitor to login, remembering the tab', async () => {
    loggedIn.next(false);
    await setup('/account/home/ai');
    await harness.fixture.whenStable();
    const router = TestBed.inject(Router);
    expect(router.url).toBe(`/account/login?returnUrl=${encodeURIComponent('/account/home/ai')}`);
  });

  it('goes to login when the session ends while on the page', async () => {
    await setup();
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    loggedIn.next(false);
    expect(navigate).toHaveBeenCalledWith(['/account/login'], expect.objectContaining({ queryParams: expect.any(Object) }));
  });
});
