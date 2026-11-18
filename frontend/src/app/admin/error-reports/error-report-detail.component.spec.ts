import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpTestingController } from '@angular/common/http/testing';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { provideTesting } from '../../testing/test-providers';
import { ErrorReportDetail } from '../../core/api';
import { ErrorReportDetailComponent } from './error-report-detail.component';

const REPORT: ErrorReportDetail = {
  id: 'r1', createdAt: '2026-11-01T10:00:00Z', source: 'FRONTEND', level: 'ERROR',
  url: 'https://pianoml.org/score/x?tab=pdf', fingerprint: 'fp1', message: 'x is undefined',
  exceptionType: 'TypeError', stackTrace: 'TypeError: x is undefined\n    at f (main.js:1:2)',
  userAgent: 'Mozilla/5.0', release: 'abc1234', userId: '11111111-2222-3333-4444-555555555555',
  context: { route: '/score/:slug' }, count: 4, firstSeen: '2026-10-01T10:00:00Z', lastSeen: '2026-11-01T10:00:00Z',
};

describe('ErrorReportDetailComponent', () => {
  let fixture: ComponentFixture<ErrorReportDetailComponent>;
  let httpMock: HttpTestingController;
  let el: HTMLElement;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [ErrorReportDetailComponent],
      providers: [...provideTesting(), { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ id: 'r1' }) } } }],
    });
    httpMock = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(ErrorReportDetailComponent);
    el = fixture.nativeElement;
    fixture.detectChanges();
  });

  afterEach(() => httpMock.verify());

  function load(report: ErrorReportDetail = REPORT): void {
    httpMock.expectOne('/admin/error-report/r1').flush(report);
    fixture.detectChanges();
  }

  it('shows the whole report', () => {
    load();
    expect(el.querySelector('[data-message]')?.textContent).toContain('x is undefined');
    expect(el.querySelector('[data-stack]')?.textContent).toContain('at f (main.js:1:2)');
    expect(el.querySelector('[data-url] a')?.getAttribute('href')).toBe(REPORT.url);
    expect(el.querySelector('[data-context]')?.textContent).toContain('/score/:slug');
    expect(el.querySelector('[data-count]')?.textContent).toBe('4');
    expect(el.textContent).toContain('Mozilla/5.0');
    expect(el.textContent).toContain('abc1234');
    expect(el.textContent).toContain(REPORT.userId!);
    expect(el.querySelector('[data-occurrences]')?.getAttribute('href')).toBe('/admin/errors?fingerprint=fp1&grouped=false');
  });

  it('never links a non-http URL', () => {
    load({ ...REPORT, url: 'javascript:alert(1)' });
    expect(el.querySelector('[data-url] a')).toBeNull();
    expect(el.querySelector('[data-url]')?.textContent).toContain('javascript:alert(1)');
  });

  it('copies the stack trace', async () => {
    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    load();
    el.querySelector<HTMLButtonElement>('[data-copy]')!.click();
    expect(writeText).toHaveBeenCalledWith(REPORT.stackTrace);
  });

  it('shows access denied on 403 and not found on 404', () => {
    httpMock.expectOne('/admin/error-report/r1').flush({}, { status: 403, statusText: 'Forbidden' });
    fixture.detectChanges();
    expect(el.querySelector('[data-state="denied"]')).not.toBeNull();

    fixture.componentInstance.load();
    httpMock.expectOne('/admin/error-report/r1').flush({}, { status: 404, statusText: 'Not Found' });
    fixture.detectChanges();
    expect(el.querySelector('[data-state="notFound"]')).not.toBeNull();
  });

  it('resolves all occurrences after confirmation, then goes back to the list', () => {
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    load();
    el.querySelector<HTMLButtonElement>('[data-delete="fingerprint"]')!.click();
    fixture.detectChanges();
    expect(el.querySelector('[role="alertdialog"]')?.textContent).toContain('4');
    el.querySelector<HTMLButtonElement>('[data-confirm]')!.click();
    const del = httpMock.expectOne(req => req.method === 'DELETE' && req.url === '/admin/error-report');
    expect(del.request.params.get('fingerprint')).toBe('fp1');
    del.flush({ deleted: 4 });
    expect(navigate).toHaveBeenCalledWith(['/admin/errors']);
  });

  it('deletes this report only after confirmation', () => {
    vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    load();
    el.querySelector<HTMLButtonElement>('[data-delete="one"]')!.click();
    fixture.detectChanges();
    httpMock.expectNone(req => req.method === 'DELETE');
    el.querySelector<HTMLButtonElement>('[data-confirm]')!.click();
    httpMock.expectOne(req => req.method === 'DELETE' && req.url === '/admin/error-report/r1').flush(null, { status: 204, statusText: 'No Content' });
  });
});
