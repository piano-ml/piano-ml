import { ChangeDetectionStrategy, Component, LOCALE_ID, OnInit, computed, inject, signal } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { catchError, forkJoin, of } from 'rxjs';
import { PracticeItemStats, PracticeService, PracticeSessionApiInfo, PracticeSummary } from '../../../core/api';

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

/** What the title cell of a session or a piece reads. */
type PracticeRow = Pick<PracticeSessionApiInfo, 'title' | 'author' | 'slug' | 'exerciseType' | 'patternKey' | 'exerciseKey' | 'tonic' | 'mode'>
  & { kind?: string };

/**
 * The user's practice on the account page (issue #399): streak, time, accuracy over the last 10 scores, the
 * latest sessions, and the way to delete that history.
 */
@Component({
  selector: 'app-practice-summary',
  imports: [RouterLink, NgTemplateOutlet],
  templateUrl: './practice-summary.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PracticeSummaryComponent implements OnInit {
  private readonly practiceService = inject(PracticeService);
  private readonly locale = inject(LOCALE_ID);
  private readonly router = inject(Router);

  readonly summary = signal<PracticeSummary | null>(null);
  readonly sessions = signal<PracticeSessionApiInfo[]>([]);
  readonly loaded = signal(false);
  readonly confirmingDelete = signal(false);
  readonly deleting = signal(false);

  /** The pieces played, from the summary: those with an accuracy, on the same basis as the sessions. */
  readonly items = computed(() => (this.summary()?.items ?? []).filter(item => item.bestAccuracy != null || item.lastAccuracy != null));

  protected readonly exerciseLabel = $localize`:@@accountHome.practice.exercise:Exercise`;

  private readonly handLabels: Record<string, string> = {
    both: $localize`:@@reimport.bothHands:Both hands`,
    left: $localize`:@@reimport.leftHand:Left hand`,
    right: $localize`:@@reimport.rightHand:Right hand`,
  };

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
      // Like the backend, which no longer keeps them: a session with neither accuracy nor flow (listening, no MIDI
      // keyboard) is not practice
      this.sessions.set(sessions.filter(session => session.accuracy != null || session.flow != null));
      this.loaded.set(true);
    });
  }

  /**
   * Where a session or a piece leads: its score, or its exercise page (/exercises/scale/C/major/intervals).
   * Null for a score deleted since, or an exercise recorded without its keys.
   */
  linkOf(row: PracticeRow): string[] | null {
    if (row.kind === 'score') {
      return row.slug ? ['/score', row.slug] : null;
    }
    return row.exerciseType && row.tonic && row.patternKey && row.exerciseKey
      ? ['/exercises', row.exerciseType, row.tonic, row.patternKey, row.exerciseKey]
      : null;
  }

  /** A click anywhere on a row opens what it leads to, in a new tab with Ctrl/Cmd; the title link handles its own clicks. */
  open(row: PracticeRow, event: MouseEvent): void {
    const link = this.linkOf(row);
    if (!link || (event.target as HTMLElement).closest('a')) {
      return;
    }
    if (event.ctrlKey || event.metaKey) {
      window.open(this.router.serializeUrl(this.router.createUrlTree(link)), '_blank', 'noopener');
    } else {
      this.router.navigate(link);
    }
  }

  hands(hands: string | undefined): string {
    return (hands && this.handLabels[hands]) || '–';
  }

  /** The measures to work on, by number ("12, 14"). */
  weakMeasures(item: PracticeItemStats): string {
    return item.weakMeasures?.map(m => m.measure).join(', ') || '–';
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

  cancelDelete(): void {
    if (!this.deleting()) {
      this.confirmingDelete.set(false);
    }
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
