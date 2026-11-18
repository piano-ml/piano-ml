import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ToastService } from '../../services/toast.service';

/** Shows the {@link ToastService} messages; placed once in the layout. */
@Component({
  selector: 'app-toast-host',
  template: `
    <div class="toast-region" role="status" aria-live="polite">
      @if (toast.current(); as t) {
        <div class="toast" [class.toast-error]="t.tone === 'error'" data-testid="toast"
          (mouseenter)="toast.pause()" (mouseleave)="toast.resume()"
          (focusin)="toast.pause()" (focusout)="toast.resume()">
          <span class="toast-message">{{ t.message }}</span>
          @if (t.action) {
            <button type="button" class="toast-action" (click)="toast.runAction()" data-testid="toast-action">{{ t.action.label }}</button>
          }
          <button type="button" class="toast-close" (click)="toast.dismiss()"
            i18n-aria-label="@@toast.dismiss" aria-label="Dismiss">✕</button>
        </div>
      }
    </div>
  `,
  styles: `
    .toast-region {
      position: fixed; left: 50%; bottom: 1.25rem; transform: translateX(-50%);
      z-index: 60; width: max-content; max-width: calc(100vw - 2rem); pointer-events: none;
    }
    .toast {
      pointer-events: auto; display: flex; align-items: center; gap: 0.75rem;
      padding: 0.625rem 0.75rem 0.625rem 1rem; border-radius: 0.25rem;
      background: #27272a; border: 1px solid #52525b; color: #e5e5e5;
      box-shadow: 0 10px 25px rgba(0, 0, 0, 0.5); font-size: 0.9375rem;
      animation: toast-in 160ms ease-out;
    }
    .toast-error { border-color: #f87171; }
    .toast-message { flex: 1; min-width: 0; }
    .toast-action {
      font-weight: 700; color: #fb7185; text-transform: uppercase; letter-spacing: 0.06em; font-size: 0.8125rem;
      padding: 0.25rem 0.5rem; border-radius: 0.125rem; cursor: pointer;
    }
    .toast-action:hover, .toast-action:focus-visible { background: rgba(251, 113, 133, 0.12); outline: none; }
    .toast-close { color: #a3a3a3; padding: 0.25rem 0.375rem; cursor: pointer; border-radius: 0.125rem; }
    .toast-close:hover, .toast-close:focus-visible { color: #fff; outline: none; background: rgba(255, 255, 255, 0.08); }
    @keyframes toast-in { from { opacity: 0; transform: translateY(0.5rem); } to { opacity: 1; transform: none; } }
    @media (prefers-reduced-motion: reduce) { .toast { animation: none; } }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ToastHostComponent {
  readonly toast = inject(ToastService);
}
