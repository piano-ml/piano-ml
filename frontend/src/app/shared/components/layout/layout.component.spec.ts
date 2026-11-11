import { ComponentFixture, TestBed } from '@angular/core/testing';
import { BehaviorSubject, of } from 'rxjs';
import { AuthService } from '../../../account/services/auth.service';
import { provideTesting } from '../../../testing/test-providers';
import { BreadcrumbService } from '../../services/breadcrumb.service';
import { LayoutComponent } from './layout.component';

/** The site frame: header (brand, breadcrumbs, donation link, login / user), footer. */
describe('LayoutComponent', () => {
  let fixture: ComponentFixture<LayoutComponent>;
  let component: LayoutComponent;
  let el: HTMLElement;
  let loggedIn: BehaviorSubject<boolean>;
  let auth: { isLoggedIn: BehaviorSubject<boolean>; getUserInfo: ReturnType<typeof vi.fn>; logout: ReturnType<typeof vi.fn> };

  function render() {
    fixture = TestBed.createComponent(LayoutComponent);
    component = fixture.componentInstance;
    el = fixture.nativeElement;
    fixture.detectChanges();
  }

  beforeEach(async () => {
    localStorage.removeItem('username');
    loggedIn = new BehaviorSubject(false);
    auth = { isLoggedIn: loggedIn, getUserInfo: vi.fn(() => of({ name: 'Alice' })), logout: vi.fn() };
    await TestBed.configureTestingModule({
      imports: [LayoutComponent],
      providers: [...provideTesting(), { provide: AuthService, useValue: auth }],
    }).compileComponents();
  });

  afterEach(() => vi.useRealTimers());

  it('links the brand to the summary page', () => {
    render();
    expect(el.querySelector('a.brand-mark')?.getAttribute('href')).toBe('/summary');
  });

  it('offers to log in when logged out, coming back to the current page', () => {
    render();
    expect(el.querySelector('a.login-btn')?.getAttribute('href')).toMatch(/^\/account\/login/);
    expect(el.querySelector('a.user-link')).toBeNull();
  });

  it("shows the user's name when logged in, and remembers it", () => {
    loggedIn.next(true);
    render();
    expect(el.querySelector('a.user-link')?.textContent?.trim()).toBe('Alice');
    expect(el.querySelector('a.login-btn')).toBeNull();
    expect(localStorage.getItem('username')).toBe('Alice');
  });

  it('logout() logs out', () => {
    render();
    component.logout();
    expect(auth.logout).toHaveBeenCalledOnce();
  });

  it('shows the breadcrumb trail, the last item as the current page', () => {
    vi.spyOn(TestBed.inject(BreadcrumbService), 'items$', 'get').mockReturnValue(of([
      { label: 'Library', path: '/library' },
      { label: 'Happy Birthday', path: '/score/happy-birthday' },
    ]));
    render();
    expect(el.querySelector('a.crumb-link')?.getAttribute('href')).toBe('/library');
    expect(el.querySelector('[aria-current="page"]')?.textContent?.trim()).toBe('Happy Birthday');
  });

  it('shows the app version in the footer', () => {
    render();
    expect(el.textContent).toContain(`PianoML@${component.version.commit}`);
  });

  describe('donation icon roulette', () => {
    it('spins through a few icons for a few seconds, then settles', () => {
      vi.useFakeTimers();
      render();
      const seen = new Set([component.donationIcon]);
      for (let t = 0; t < 40; t++) { // 32 spins slowing down: about 3.3 s in all
        vi.advanceTimersByTime(100);
        seen.add(component.donationIcon);
      }
      expect(seen.size).toBeGreaterThan(1);
      const settled = component.donationIcon;
      vi.advanceTimersByTime(5000);
      expect(component.donationIcon).toBe(settled);
      fixture.detectChanges();
      expect(el.querySelector('.donation-icon')?.textContent).toBe(settled);
    });

    it('stops spinning when the layout is destroyed', () => {
      vi.useFakeTimers();
      render();
      const before = component.donationIcon;
      fixture.destroy();
      vi.advanceTimersByTime(5000);
      expect(component.donationIcon).toBe(before);
    });
  });
});
