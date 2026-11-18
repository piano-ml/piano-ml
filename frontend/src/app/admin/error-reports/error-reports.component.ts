import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DatePipe } from '@angular/common';
import { ActivatedRoute, ParamMap, Router, RouterLink, convertToParamMap } from '@angular/router';
import { ErrorReportLevel, ErrorReportPage, ErrorReportService, ErrorReportSource, ErrorReportSummary } from '../../core/api';
import { ConfirmDialogComponent } from './confirm-dialog.component';
import { ADMIN_CALL, LoadError, linkable, loadError } from './error-report-format';

export const PAGE_SIZE = 50;

/** The list filters, as kept in the page's query parameters (so Back and shared links keep them). */
export interface ErrorReportFilters {
  source: ErrorReportSource | '';
  level: ErrorReportLevel | '';
  /** yyyy-mm-dd, local day */
  from: string;
  to: string;
  q: string;
  fingerprint: string;
  grouped: boolean;
  offset: number;
}

export function filtersFrom(params: ParamMap): ErrorReportFilters {
  const source = params.get('source');
  const level = params.get('level');
  const offset = Number(params.get('offset'));
  return {
    source: source === 'BACKEND' || source === 'FRONTEND' ? source : '',
    level: level === 'ERROR' || level === 'WARNING' ? level : '',
    from: params.get('from') ?? '',
    to: params.get('to') ?? '',
    q: params.get('q') ?? '',
    fingerprint: params.get('fingerprint') ?? '',
    grouped: params.get('grouped') !== 'false',
    offset: Number.isInteger(offset) && offset > 0 ? offset : 0,
  };
}

/** Start of a local day as an ISO instant; `nextDay` for an exclusive end ("to" includes its whole day). */
export function dayStart(day: string, nextDay = false): string | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) {
    return undefined;
  }
  const date = new Date(`${day}T00:00:00`);
  if (Number.isNaN(date.getTime())) {
    return undefined;
  }
  if (nextDay) {
    date.setDate(date.getDate() + 1);
  }
  return date.toISOString();
}

/**
 * Admin list of the error reports (issue #410): filters, grouping by fingerprint, paging, deletion.
 */
@Component({
  selector: 'app-error-reports',
  imports: [RouterLink, DatePipe, ConfirmDialogComponent],
  templateUrl: './error-reports.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ErrorReportsComponent implements OnInit {
  private readonly api = inject(ErrorReportService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  readonly filters = signal<ErrorReportFilters>(filtersFrom(this.route.snapshot.queryParamMap));
  readonly page = signal<ErrorReportPage | null>(null);
  readonly loading = signal(true);
  readonly error = signal<LoadError | null>(null);

  readonly pendingDelete = signal<ErrorReportSummary | null>(null);
  readonly deleting = signal(false);

  readonly linkable = linkable;
  readonly pageSize = PAGE_SIZE;

  ngOnInit(): void {
    this.route.queryParamMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(params => {
      this.filters.set(filtersFrom(params));
      this.load();
    });
  }

  load(): void {
    const f = this.filters();
    this.loading.set(true);
    this.api.adminErrorReportsGet(
      f.source || undefined, f.level || undefined, dayStart(f.from), dayStart(f.to, true),
      f.q.trim() || undefined, f.fingerprint || undefined, f.grouped, f.offset, PAGE_SIZE,
      'body', false, ADMIN_CALL,
    ).subscribe({
      next: page => {
        this.page.set(page);
        this.error.set(null);
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.error.set(loadError(error));
        this.loading.set(false);
      },
    });
  }

  /** Changes filters: back to the first page, kept in the URL (which reloads the list). */
  apply(changes: Partial<ErrorReportFilters>): void {
    this.navigate({ ...this.filters(), offset: 0, ...changes });
  }

  goToPage(offset: number): void {
    this.navigate({ ...this.filters(), offset: Math.max(0, offset) });
  }

  clearFilters(): void {
    this.navigate({ ...filtersFrom(convertToParamMap({})), grouped: this.filters().grouped });
  }

  private navigate(f: ErrorReportFilters): void {
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {
        source: f.source || null,
        level: f.level || null,
        from: f.from || null,
        to: f.to || null,
        q: f.q.trim() || null,
        fingerprint: f.fingerprint || null,
        grouped: f.grouped ? null : 'false',
        offset: f.offset || null,
      },
    });
  }

  onSearch(event: Event, input: HTMLInputElement): void {
    event.preventDefault();
    this.apply({ q: input.value });
  }

  value(event: Event): string {
    return (event.target as HTMLInputElement | HTMLSelectElement).value;
  }

  // --- delete --------------------------------------------------------------------------------------------------

  askDelete(item: ErrorReportSummary): void {
    this.pendingDelete.set(item);
  }

  cancelDelete(): void {
    this.pendingDelete.set(null);
  }

  /** Grouped: resolves the whole fingerprint; otherwise deletes the one occurrence. Then refreshes the list. */
  confirmDelete(): void {
    const item = this.pendingDelete();
    if (!item || this.deleting()) {
      return;
    }
    this.deleting.set(true);
    const call = this.filters().grouped
      ? this.api.adminErrorReportsDelete(item.fingerprint, 'body', false, ADMIN_CALL)
      : this.api.adminErrorReportDelete(item.id, 'body', false, ADMIN_CALL);
    call.subscribe({
      next: () => {
        this.deleting.set(false);
        this.pendingDelete.set(null);
        this.load();
      },
      error: (error: unknown) => {
        this.deleting.set(false);
        this.pendingDelete.set(null);
        this.error.set(loadError(error));
      },
    });
  }

  deleteMessage(item: ErrorReportSummary): string {
    return this.filters().grouped
      ? $localize`:@@adminErrors.delete.groupBody:All ${item.count ?? 1}:count: occurrences of this error will be deleted. Do it once the bug is fixed.`
      : $localize`:@@adminErrors.delete.oneBody:This occurrence will be deleted. Other occurrences of the same error are kept.`;
  }

  deleteTitle(): string {
    return this.filters().grouped
      ? $localize`:@@adminErrors.delete.groupTitle:Resolve this error?`
      : $localize`:@@adminErrors.delete.oneTitle:Delete this report?`;
  }

  deleteLabel(): string {
    return this.filters().grouped
      ? $localize`:@@adminErrors.delete.groupConfirm:Delete all`
      : $localize`:@@adminErrors.delete.oneConfirm:Delete`;
  }

  shown(): { first: number; last: number; total: number } {
    const p = this.page();
    const total = p?.total ?? 0;
    const first = total === 0 ? 0 : (p?.offset ?? 0) + 1;
    return { first, last: (p?.offset ?? 0) + (p?.items.length ?? 0), total };
  }
}

