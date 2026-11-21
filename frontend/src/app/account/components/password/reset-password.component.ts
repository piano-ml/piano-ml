import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { Location } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { AbstractControl, FormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { AuthService } from '../../services/auth.service';

type State = 'form' | 'done' | 'invalid';

/**
 * The page of a password reset link (`?token=...`): chooses a new password. The token is taken out of the
 * address bar as soon as it is read, so it does not stay in the history or leak in a Referer.
 */
@Component({
  selector: 'app-reset-password',
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './reset-password.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ResetPasswordComponent implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly location = inject(Location);

  readonly form = inject(FormBuilder).nonNullable.group({
    password: ['', [Validators.required, Validators.minLength(8)]],
    confirmPassword: ['', Validators.required],
  }, { validators: passwordsMatch });
  readonly state = signal<State>('form');
  readonly saving = signal(false);
  readonly failed = signal(false);
  private token = '';

  ngOnInit() {
    this.token = this.route.snapshot.queryParamMap.get('token') ?? '';
    if (!this.token) {
      this.state.set('invalid');
      return;
    }
    this.location.replaceState(this.location.path().split('?')[0]);
  }

  submit() {
    if (this.form.invalid || this.saving()) return;
    this.saving.set(true);
    this.failed.set(false);
    this.auth.resetPassword(this.token, this.form.getRawValue().password).subscribe({
      next: () => {
        this.saving.set(false);
        this.state.set('done');
      },
      error: (err: unknown) => {
        this.saving.set(false);
        if (err instanceof HttpErrorResponse && err.status === 400 && err.error?.error === 'invalid_token') {
          this.state.set('invalid');
        } else {
          this.failed.set(true);
        }
      },
    });
  }
}

function passwordsMatch(group: AbstractControl): ValidationErrors | null {
  const { password, confirmPassword } = group.value as { password: string; confirmPassword: string };
  return confirmPassword && password !== confirmPassword ? { mismatch: true } : null;
}
