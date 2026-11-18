import { ChangeDetectionStrategy, Component, ElementRef, afterNextRender, inject, input, output } from '@angular/core';

/** In-app confirmation (no window.confirm): Escape or the backdrop cancel, focus starts on Cancel. */
@Component({
  selector: 'app-confirm-dialog',
  template: `
    <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" (click)="cancelled.emit()">
      <div class="w-full max-w-md rounded-sm border border-neutral-700 bg-neutral-900 p-6 shadow-xl"
           role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" aria-describedby="confirm-body"
           (click)="$event.stopPropagation()" (keydown.escape)="cancelled.emit()">
        <h2 id="confirm-title" class="text-lg font-bold text-neutral-100">{{ title() }}</h2>
        <p id="confirm-body" class="mt-2 text-sm text-neutral-400">{{ message() }}</p>
        <div class="mt-6 flex justify-end gap-3">
          <button type="button" class="btn-secondary" data-cancel (click)="cancelled.emit()" i18n="@@adminErrors.cancel">Cancel</button>
          <button type="button" class="btn-danger" data-confirm [disabled]="busy()" (click)="confirmed.emit()">{{ confirmLabel() }}</button>
        </div>
      </div>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConfirmDialogComponent {
  readonly title = input.required<string>();
  readonly message = input.required<string>();
  readonly confirmLabel = input.required<string>();
  readonly busy = input(false);
  readonly confirmed = output<void>();
  readonly cancelled = output<void>();

  constructor() {
    const host = inject(ElementRef<HTMLElement>);
    afterNextRender(() => host.nativeElement.querySelector('[data-cancel]')?.focus());
  }
}
