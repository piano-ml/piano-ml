import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { vi } from 'vitest';
import { PracticeService, type PracticeSessionApiInfo, type PracticeSummary } from '../../../core/api';
import { PracticeSummaryComponent, formatDuration } from './practice-summary.component';

const SUMMARY: PracticeSummary = {
  regularity: { currentStreakDays: 4 },
  volume: { sessions: 12, activeSeconds: 3 * 3600 + 5 * 60, activeSeconds7: 45 * 60 },
  scoreAccuracy: { last10: { sessions: 10, accuracy: 0.92 } },
};
const SESSIONS: PracticeSessionApiInfo[] = [
  { id: 'a', kind: 'score', slug: 'prelude', title: 'Prelude', startedAt: '2026-11-15T10:00:00Z', endedAt: '2026-11-15T10:10:00Z', activeSeconds: 540, accuracy: 0.9 },
  { id: 'b', kind: 'exercise', title: 'Left then right', tonic: 'Am', startedAt: '2026-11-14T10:00:00Z', endedAt: '2026-11-14T10:05:00Z', activeSeconds: 120 },
];

describe('PracticeSummaryComponent', () => {
  let fixture: ComponentFixture<PracticeSummaryComponent>;
  let api: Record<'practiceSummaryGet' | 'practiceSessionsGet' | 'practiceSessionsDelete', ReturnType<typeof vi.fn>>;

  function create(summary: PracticeSummary | Error = SUMMARY, sessions = SESSIONS) {
    api = {
      practiceSummaryGet: vi.fn(() => (summary instanceof Error ? throwError(() => summary) : of(summary))),
      practiceSessionsGet: vi.fn(() => of(sessions)),
      practiceSessionsDelete: vi.fn(() => of(null)),
    };
    TestBed.configureTestingModule({
      imports: [PracticeSummaryComponent],
      providers: [provideRouter([]), { provide: PracticeService, useValue: api }],
    });
    fixture = TestBed.createComponent(PracticeSummaryComponent);
    fixture.detectChanges();
  }

  const el = () => fixture.nativeElement as HTMLElement;
  const text = (testId: string) => el().querySelector(`[data-testid="${testId}"]`)?.textContent?.trim();

  it('shows the streak, the time of the week and the accuracy of the last 10 scores', () => {
    create();
    expect(text('practice-streak')).toBe('4');
    expect(text('practice-week')).toBe('45 min');
    expect(text('practice-accuracy')).toBe('92%');
  });

  it('lists the latest sessions, scores linked to their page', () => {
    create();
    const rows = el().querySelectorAll('[data-testid="practice-session"]');
    expect(rows).toHaveLength(2);
    expect(rows[0].querySelector('a')?.getAttribute('href')).toBe('/score/prelude');
    expect(rows[0].textContent).toContain('9 min');
    expect(rows[0].textContent).toContain('90%');
    expect(rows[1].querySelector('a')).toBeNull();
    expect(rows[1].textContent).toContain('Am');
    expect(rows[1].textContent).toContain('–'); // not assessed
  });

  it('says so when nothing was recorded', () => {
    create({ volume: { sessions: 0 } }, []);
    expect(text('practice-empty')).toContain('Nothing recorded yet');
    expect(el().querySelector('[data-testid="practice-delete"]')).toBeNull();
  });

  it('stays out of the page when the summary cannot be loaded', () => {
    create(new Error('offline'));
    expect(el().querySelector('[data-testid="practice-summary"]')).toBeNull();
  });

  it('deletes the history only after a confirmation, then reloads', () => {
    create();
    (el().querySelector('[data-testid="practice-delete"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(api.practiceSessionsDelete).not.toHaveBeenCalled();

    (el().querySelector('[data-testid="practice-delete-confirm"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(api.practiceSessionsDelete).toHaveBeenCalledOnce();
    expect(api.practiceSummaryGet).toHaveBeenCalledTimes(2);
  });

  it('formats durations in hours and minutes', () => {
    expect(formatDuration(59, 'en')).toBe('1 min');
    expect(formatDuration(3600, 'en')).toBe('1 hr');
    expect(formatDuration(3 * 3600 + 5 * 60, 'en')).toBe('3 hr 5 min');
    expect(formatDuration(0, 'en')).toBe('0 min');
  });
});
