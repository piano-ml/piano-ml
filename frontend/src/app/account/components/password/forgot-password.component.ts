import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../services/auth.service';

/**
 * "Forgot your password?": asks for a reset link by email. The confirmation reads the same whether or not an
 * account uses the email, as the API's answer does. The email typed on the login page comes along (navigation
 * state, never the URL).
 */
@Component({
  selector: 'app-forgot-password',
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './forgot-password.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ForgotPasswordComponent {
  private readonly auth = inject(AuthService);

  readonly form = inject(FormBuilder).nonNullable.group({
    email: [initialEmail(), [Validators.required, Validators.email]],
  });
  readonly sending = signal(false);
  /** The email the link was sent to, once asked. */
  readonly sentTo = signal<string | null>(null);
  readonly failed = signal(false);

  submit() {
    if (this.form.invalid || this.sending()) return;
    const email = this.form.getRawValue().email.trim();
    this.sending.set(true);
    this.failed.set(false);
    this.auth.requestPasswordReset(email).subscribe({
      next: () => {
        this.sending.set(false);
        this.sentTo.set(email);
      },
      error: () => {
        this.sending.set(false);
        this.failed.set(true);
      },
    });
  }
}

/** The email passed by the login page's link, if any. */
function initialEmail(): string {
  const state = typeof history === 'undefined' ? null : history.state;
  return typeof state?.email === 'string' ? state.email : '';
}
