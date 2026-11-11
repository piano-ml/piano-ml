import { Component, PLATFORM_ID, RESPONSE_INIT } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, type Route, Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { ErrorComponent } from './components/error/error.component';
import { clientOnlyGuard } from './guards/client-only.guard';
import { ElapsedTimePipe } from './pipes/elapsed-time.pipe';
import { ResponseStatusService } from './seo/response-status.service';
import { LoadingService } from './services/loading.service';
import { RouteLoadingService } from './services/route-loading.service';

@Component({ template: '' })
class PageComponent {}

describe('ElapsedTimePipe', () => {
  const pipe = new ElapsedTimePipe();

  it.each([
    [null, '00:00'],
    [0, '00:00'],
    [999, '00:00'],
    [61_000, '01:01'],
    [599_000, '09:59'],
    [3_600_000, '01:00:00'],
    [3_723_000, '01:02:03'],
  ])('%s ms is %s', (ms, expected) => {
    expect(pipe.transform(ms)).toBe(expected);
  });
});

describe('clientOnlyGuard', () => {
  const run = (platform: string) => {
    TestBed.configureTestingModule({ providers: [{ provide: PLATFORM_ID, useValue: platform }] });
    return TestBed.runInInjectionContext(() => clientOnlyGuard({} as Route, [], {} as never));
  };

  it('lets the route load in the browser', () => {
    expect(run('browser')).toBe(true);
  });

  it('keeps it out of server-side rendering', () => {
    expect(run('server')).toBe(false);
  });
});

describe('ResponseStatusService', () => {
  it('sets the status of the server response', () => {
    const response: { status?: number } = {};
    TestBed.configureTestingModule({ providers: [{ provide: RESPONSE_INIT, useValue: response }] });
    TestBed.inject(ResponseStatusService).set(404);
    expect(response.status).toBe(404);
  });

  it('does nothing in the browser', () => {
    expect(() => TestBed.inject(ResponseStatusService).set(404)).not.toThrow();
  });
});

describe('ErrorComponent', () => {
  function render(data: Record<string, unknown>) {
    const set = vi.fn();
    TestBed.configureTestingModule({
      imports: [ErrorComponent],
      providers: [
        provideRouter([]),
        { provide: ActivatedRoute, useValue: { snapshot: { data } } },
        { provide: ResponseStatusService, useValue: { set } },
      ],
    });
    const fixture = TestBed.createComponent(ErrorComponent);
    fixture.detectChanges();
    return { set, el: fixture.nativeElement as HTMLElement };
  }

  it("answers with the route's status (404 for unknown URLs)", () => {
    const { set } = render({ status: 404 });
    expect(set).toHaveBeenCalledWith(404);
  });

  it('keeps the default status otherwise', () => {
    const { set, el } = render({});
    expect(set).not.toHaveBeenCalled();
    expect(el.textContent?.trim().length).toBeGreaterThan(0);
  });
});

describe('RouteLoadingService', () => {
  it('shows the loading spinner during a navigation, and hides it after', async () => {
    let release!: () => void;
    TestBed.configureTestingModule({
      providers: [provideRouter([
        { path: 'slow', component: PageComponent, canActivate: [() => new Promise<boolean>((resolve) => { release = () => resolve(true); })] },
        { path: 'blocked', component: PageComponent, canActivate: [() => false] },
      ])],
    });
    TestBed.inject(RouteLoadingService);
    const loading = TestBed.inject(LoadingService);
    const router = TestBed.inject(Router);
    await RouterTestingHarness.create();

    const navigation = router.navigateByUrl('/slow');
    await new Promise((resolve) => setTimeout(resolve));
    expect(loading.isLoading()).toBe(true);
    release();
    await navigation;
    expect(loading.isLoading()).toBe(false);

    await router.navigateByUrl('/blocked'); // cancelled navigation
    expect(loading.isLoading()).toBe(false);
  });
});

describe('LoadingService', () => {
  it('forceHide() clears every pending show()', () => {
    const loading = TestBed.inject(LoadingService);
    loading.show();
    loading.show();
    loading.forceHide();
    expect(loading.loading).toBe(false);
    loading.show();
    loading.hide();
    expect(loading.isLoading()).toBe(false);
  });
});
