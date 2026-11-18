import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { DatePipe, JsonPipe } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ErrorReportDetail, ErrorReportService } from '../../core/api';
import { ConfirmDialogComponent } from './confirm-dialog.component';
import { ADMIN_CALL, LoadError, linkable, loadError } from './error-report-format';

type PendingDelete = 'one' | 'fingerprint';

/**
 * One error report in full (issue #410): message, copyable stack trace, request, browser, release, user,
 * context, and how often its error occurs; delete it, or all its occurrences once the bug is fixed.
 */
@Component({
  selector: 'app-error-report-detail',
  imports: [RouterLink, DatePipe, JsonPipe, ConfirmDialogComponent],
  templateUrl: './error-report-detail.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ErrorReportDetailComponent implements OnInit {
  private readonly api = inject(ErrorReportService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly report = signal<ErrorReportDetail | null>(null);
  readonly loading = signal(true);
  readonly error = signal<LoadError | 'notFound' | null>(null);
  readonly copied = signal(false);

  readonly pendingDelete = signal<PendingDelete | null>(null);
  readonly deleting = signal(false);

  readonly linkable = linkable;

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    const id = this.route.snapshot.paramMap.get('id') ?? '';
    this.loading.set(true);
    this.api.adminErrorReportGet(id, 'body', false, ADMIN_CALL).subscribe({
      next: report => {
        this.report.set(report);
        this.error.set(null);
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.loading.set(false);
        this.error.set((error as { status?: number })?.status === 404 ? 'notFound' : loadError(error));
      },
    });
  }

  hasContext(): boolean {
    const context = this.report()?.context;
    return !!context && Object.keys(context).length > 0;
  }

  copyStack(): void {
    const stack = this.report()?.stackTrace;
    if (!stack) {
      return;
    }
    navigator.clipboard?.writeText(stack).then(() => this.copied.set(true), () => undefined);
  }

  askDelete(kind: PendingDelete): void {
    this.pendingDelete.set(kind);
  }

  cancelDelete(): void {
    this.pendingDelete.set(null);
  }

  confirmDelete(): void {
    const report = this.report();
    const kind = this.pendingDelete();
    if (!report || !kind || this.deleting()) {
      return;
    }
    this.deleting.set(true);
    const call = kind === 'fingerprint'
      ? this.api.adminErrorReportsDelete(report.fingerprint, 'body', false, ADMIN_CALL)
      : this.api.adminErrorReportDelete(report.id, 'body', false, ADMIN_CALL);
    call.subscribe({
      next: () => {
        this.deleting.set(false);
        this.pendingDelete.set(null);
        this.router.navigate(['/admin/errors']);
      },
      error: (error: unknown) => {
        this.deleting.set(false);
        this.pendingDelete.set(null);
        this.error.set(loadError(error));
      },
    });
  }

  deleteTitle(kind: PendingDelete): string {
    return kind === 'fingerprint'
      ? $localize`:@@adminErrors.delete.groupTitle:Resolve this error?`
      : $localize`:@@adminErrors.delete.oneTitle:Delete this report?`;
  }

  deleteMessage(kind: PendingDelete): string {
    return kind === 'fingerprint'
      ? $localize`:@@adminErrors.delete.groupBody:All ${this.report()?.count ?? 1}:count: occurrences of this error will be deleted. Do it once the bug is fixed.`
      : $localize`:@@adminErrors.delete.oneBody:This occurrence will be deleted. Other occurrences of the same error are kept.`;
  }

  deleteLabel(kind: PendingDelete): string {
    return kind === 'fingerprint'
      ? $localize`:@@adminErrors.delete.groupConfirm:Delete all`
      : $localize`:@@adminErrors.delete.oneConfirm:Delete`;
  }
}
