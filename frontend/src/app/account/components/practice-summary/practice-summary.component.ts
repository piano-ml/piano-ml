import { ChangeDetectionStrategy, Component, LOCALE_ID, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { catchError, forkJoin, of } from 'rxjs';
import { PracticeService, PracticeSessionApiInfo, PracticeSummary } from '../../../core/api';

/** Rounded to minutes, in the reader's language ("1 hr 5 min"); the unit names come from the browser. */
export function formatDuration(seconds: number, locale: string): string {
  const minutes = Math.round(seconds / 60);
  const unit = (value: number, name: 'hour' | 'minute') =>
    new Intl.NumberFormat(locale, { style: 'unit', unit: name, unitDisplay: 'short' }).format(value);
  if (minutes < 60) {
    return unit(minutes, 'minute');
  }
  const rest = minutes % 60;
  return rest ? `${unit(Math.floor(minutes / 60), 'hour')} ${unit(rest, 'minute')}` : unit(minutes / 60, 'hour');
}

/**
 * The user's practice on the account page (issue #399): streak, time, accuracy over the last 10 scores, the
 * latest sessions, and the way to delete that history.
 */
@Component({
  selector: 'app-practice-summary',
  imports: [RouterLink],
  templateUrl: './practice-summary.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PracticeSummaryComponent implements OnInit {
  private readonly practiceService = inject(PracticeService);
  private readonly locale = inject(LOCALE_ID);

  readonly summary = signal<PracticeSummary | null>(null);
  readonly sessions = signal<PracticeSessionApiInfo[]>([]);
  readonly loaded = signal(false);
  readonly confirmingDelete = signal(false);
  readonly deleting = signal(false);

  ngOnInit(): void {
    this.load();
  }

  private load(): void {
    let timeZone: string | undefined;
    try {
      timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    } catch {
      timeZone = undefined;
    }
    // A failure leaves the section out: the rest of the account page does not depend on it
    forkJoin({
      summary: this.practiceService.practiceSummaryGet(timeZone).pipe(catchError(() => of(null))),
      sessions: this.practiceService.practiceSessionsGet(10).pipe(catchError(() => of([]))),
    }).subscribe(({ summary, sessions }) => {
      this.summary.set(summary);
      this.sessions.set(sessions);
      this.loaded.set(true);
    });
  }

  duration(seconds: number | undefined): string {
    return formatDuration(seconds ?? 0, this.locale);
  }

  percent(ratio: number | undefined | null): string {
    return ratio == null ? '–' : new Intl.NumberFormat(this.locale, { style: 'percent' }).format(ratio);
  }

  date(iso: string): string {
    return new Intl.DateTimeFormat(this.locale, { dateStyle: 'medium' }).format(new Date(iso));
  }

  deleteHistory(): void {
    this.deleting.set(true);
    this.practiceService.practiceSessionsDelete().subscribe({
      next: () => {
        this.deleting.set(false);
        this.confirmingDelete.set(false);
        this.load();
      },
      error: () => this.deleting.set(false),
    });
  }
}
