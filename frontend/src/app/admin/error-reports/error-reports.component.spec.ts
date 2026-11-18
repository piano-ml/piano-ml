import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpTestingController } from '@angular/common/http/testing';
import { HttpRequest } from '@angular/common/http';
import { Router, provideRouter } from '@angular/router';
import { provideTesting } from '../../testing/test-providers';
import { ErrorReportPage, ErrorReportSummary } from '../../core/api';
import { SKIP_ERROR_REPORT } from '../../core/error-reporting/error-reporting.config';
import { ErrorReportsComponent, dayStart } from './error-reports.component';

const LIST = '/admin/error-report';

function summary(overrides: Partial<ErrorReportSummary> = {}): ErrorReportSummary {
  return {
    id: 'r1', createdAt: '2026-11-01T10:00:00Z', source: 'FRONTEND', level: 'ERROR',
    url: 'https://pianoml.org/score/x', fingerprint: 'fp1', message: 'x is undefined',
    count: 3, firstSeen: '2026-10-01T10:00:00Z', lastSeen: '2026-11-01T10:00:00Z', ...overrides,
  };
}

function page(items: ErrorReportSummary[], total = items.length, offset = 0): ErrorReportPage {
  return { items, total, offset, limit: 50 };
}

describe('ErrorReportsComponent', () => {
  let fixture: ComponentFixture<ErrorReportsComponent>;
  let httpMock: HttpTestingController;
  let el: HTMLElement;

  async function render(url = '/admin/errors'): Promise<void> {
    await TestBed.inject(Router).navigateByUrl(url);
    fixture = TestBed.createComponent(ErrorReportsComponent);
    el = fixture.nativeElement;
    fixture.detectChanges();
  }

  function expectList(): ReturnType<HttpTestingController['expectOne']> {
    return httpMock.expectOne(req => req.url === LIST && req.method === 'GET');
  }

  async function settle(): Promise<void> {
    await fixture.whenStable();
    fixture.detectChanges();
  }

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [ErrorReportsComponent],
      providers: [...provideTesting(), provideRouter([{ path: 'admin/errors', component: ErrorReportsComponent }])],
    });
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('lists grouped reports by default, with the URL as a link for browser errors', async () => {
    await render();
    const req = expectList();
    expect(req.request.params.get('grouped')).toBe('true');
    expect(req.request.params.get('offset')).toBe('0');
    expect(req.request.params.get('limit')).toBe('50');
    expect(req.request.context.get(SKIP_ERROR_REPORT)).toBe(true);
    req.flush(page([summary(), summary({ id: 'r2', source: 'BACKEND', url: 'http://api/x', fingerprint: 'fp2', count: 1 })]));
    fixture.detectChanges();

    const rows = el.querySelectorAll('[data-row]');
    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).toContain('x is undefined');
    expect(rows[0].querySelector('a[target="_blank"]')?.getAttribute('href')).toBe('https://pianoml.org/score/x');
    expect(rows[1].querySelector('a[target="_blank"]')).toBeNull(); // backend URL: text only
    expect(el.textContent).toContain('3 months');
  });

  it('maps the filters to query parameters of the API', async () => {
    await render('/admin/errors?source=BACKEND&level=WARNING&from=2026-11-01&to=2026-11-02&q=boom&grouped=false&offset=50&fingerprint=fp9');
    const req = expectList();
    const params = req.request.params;
    expect(params.get('source')).toBe('BACKEND');
    expect(params.get('level')).toBe('WARNING');
    expect(params.get('from')).toBe(dayStart('2026-11-01'));
    expect(params.get('to')).toBe(dayStart('2026-11-03'));
    expect(params.get('q')).toBe('boom');
    expect(params.get('grouped')).toBe('false');
    expect(params.get('offset')).toBe('50');
    expect(params.get('fingerprint')).toBe('fp9');
    req.flush(page([]));
  });

  it('changing a filter goes back to the first page and reloads', async () => {
    await render('/admin/errors?offset=50');
    expectList().flush(page([summary()], 120, 50));
    fixture.detectChanges();

    const select = el.querySelector<HTMLSelectElement>('[data-filter="source"]')!;
    select.value = 'FRONTEND';
    select.dispatchEvent(new Event('change'));
    await settle();

    const req = expectList();
    expect(req.request.params.get('source')).toBe('FRONTEND');
    expect(req.request.params.get('offset')).toBe('0');
    req.flush(page([]));
  });

  it('searches on submit and switches to all occurrences', async () => {
    await render();
    expectList().flush(page([summary()]));
    fixture.detectChanges();

    el.querySelector<HTMLInputElement>('[data-filter="q"]')!.value = ' pdf ';
    el.querySelector('form')!.dispatchEvent(new Event('submit'));
    await settle();
    expect(expectList().request.params.get('q')).toBe('pdf');

    el.querySelector<HTMLButtonElement>('[data-view="all"]')!.click();
    await settle();
    const req = expectList();
    expect(req.request.params.get('grouped')).toBe('false');
    expect(req.request.params.get('q')).toBe('pdf');
    req.flush(page([]));
  });

  it('pages with Next', async () => {
    await render();
    expectList().flush(page([summary()], 120, 0));
    fixture.detectChanges();
    el.querySelector<HTMLButtonElement>('[data-page="next"]')!.click();
    await settle();
    const req = expectList();
    expect(req.request.params.get('offset')).toBe('50');
    req.flush(page([]));
  });

  it('shows an access-denied state on 403, without retrying', async () => {
    await render();
    expectList().flush({}, { status: 403, statusText: 'Forbidden' });
    fixture.detectChanges();
    expect(el.querySelector('[data-state="denied"]')).not.toBeNull();
    expect(el.querySelector('[data-row]')).toBeNull();
    httpMock.expectNone(LIST);
  });

  it('asks for confirmation before resolving a group, then refreshes the list', async () => {
    await render();
    expectList().flush(page([summary()]));
    fixture.detectChanges();

    el.querySelector<HTMLButtonElement>('[data-delete]')!.click();
    fixture.detectChanges();
    expect(el.querySelector('[role="alertdialog"]')?.textContent).toContain('3');
    httpMock.expectNone((req: HttpRequest<unknown>) => req.method === 'DELETE');

    el.querySelector<HTMLButtonElement>('[data-confirm]')!.click();
    const del = httpMock.expectOne(req => req.method === 'DELETE' && req.url === LIST);
    expect(del.request.params.get('fingerprint')).toBe('fp1');
    del.flush({ deleted: 3 });
    fixture.detectChanges();

    expect(el.querySelector('[role="alertdialog"]')).toBeNull();
    expectList().flush(page([]));
    fixture.detectChanges();
    expect(el.querySelector('[data-state="empty"]')).not.toBeNull();
  });

  it('deletes one occurrence in the all-occurrences view; Cancel deletes nothing', async () => {
    await render('/admin/errors?grouped=false');
    expectList().flush(page([summary({ count: undefined })]));
    fixture.detectChanges();

    el.querySelector<HTMLButtonElement>('[data-delete]')!.click();
    fixture.detectChanges();
    el.querySelector<HTMLButtonElement>('[data-cancel]')!.click();
    fixture.detectChanges();
    expect(el.querySelector('[role="alertdialog"]')).toBeNull();

    el.querySelector<HTMLButtonElement>('[data-delete]')!.click();
    fixture.detectChanges();
    el.querySelector<HTMLButtonElement>('[data-confirm]')!.click();
    httpMock.expectOne(req => req.method === 'DELETE' && req.url === `${LIST}/r1`).flush(null, { status: 204, statusText: 'No Content' });
    expectList().flush(page([]));
  });
});

describe('dayStart', () => {
  it('turns a local day into an ISO instant, and rejects anything else', () => {
    expect(dayStart('2026-11-01')).toBe(new Date('2026-11-01T00:00:00').toISOString());
    expect(dayStart('2026-12-31', true)).toBe(new Date('2027-01-01T00:00:00').toISOString());
    expect(dayStart('')).toBeUndefined();
    expect(dayStart('yesterday')).toBeUndefined();
  });
});
