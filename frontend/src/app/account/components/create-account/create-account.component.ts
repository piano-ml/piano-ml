
import { Component, ChangeDetectionStrategy } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { AccountCreatePost409Response } from '../../../core/api';

@Component({
  selector: 'app-create-account',
  imports: [ReactiveFormsModule, RouterModule],
  templateUrl: './create-account.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './create-account.component.css'
})
export class CreateAccountComponent {
  createAccountForm: FormGroup;
  passwordStrength = {
    weak: false,
    medium: false,
    strong: false,
  };

  constructor(private fb: FormBuilder, private authService: AuthService, private router: Router) {
    this.createAccountForm = this.fb.group({
      name: ['', Validators.required],
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(8)]],
      confirmPassword: ['', Validators.required]
    }, { validator: this.passwordMatchValidator });
  }

  passwordMatchValidator(form: FormGroup) {
    const password = form.get('password');
    const confirmPassword = form.get('confirmPassword');
    if (password && confirmPassword && password.value !== confirmPassword.value) {
      confirmPassword.setErrors({ mismatch: true });
    } else if (confirmPassword) {
      confirmPassword.setErrors(null);
    }
    return null;
  }

  checkPasswordStrength(password: string) {
    const hasNumber = /\d/.test(password);
    const hasUpper = /[A-Z]/.test(password);
    const hasLower = /[a-z]/.test(password);

    if (password.length >= 12 && hasNumber && hasUpper && hasLower) {
      this.passwordStrength = { weak: false, medium: false, strong: true };
    } else if (password.length >= 8 && ((hasNumber && hasLower) || (hasNumber && hasUpper) || (hasUpper && hasLower))) {
      this.passwordStrength = { weak: false, medium: true, strong: false };
    } else {
      this.passwordStrength = { weak: true, medium: false, strong: false };
    }
  }

  onSubmit() {
    if (this.createAccountForm.valid) {
      this.checkPasswordStrength(this.createAccountForm.value.password);
      //if (this.passwordStrength.strong || this.passwordStrength.medium) {
        // Call auth service
        this.authService.register(this.createAccountForm.value).subscribe({
          next: () => {
            // Redirect to login or home
            this.router.navigate(['/account/login'], { queryParamsHandling: 'preserve' });
          },
          error: (err) => {
            if (this.showTaken(err)) return;
            this.router.navigate(['/error']);
            console.error(err);
          }
        });
      //} else {
      //  // show password too weak error
      //}
    }
  }

  /**
   * A 409 tells which field another account already has (email or name): shown under that field, which stays
   * invalid until the user changes it, instead of leaving the form for the error page.
   * @returns whether the error was such a conflict
   */
  private showTaken(err: unknown): boolean {
    const conflict = err instanceof HttpErrorResponse && err.status === 409
      ? err.error as Partial<AccountCreatePost409Response> | null : null;
    const fields: readonly string[] = Object.values(AccountCreatePost409Response.FieldEnum);
    const field = conflict?.field;
    const control = field && fields.includes(field) ? this.createAccountForm.get(field) : null;
    if (!control) return false;
    control.setErrors({ ...control.errors, taken: true });
    control.markAsTouched();
    return true;
  }
}
