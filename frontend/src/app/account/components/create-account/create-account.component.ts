import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-create-account',
  imports: [ReactiveFormsModule, CommonModule, RouterModule],
  templateUrl: './create-account.component.html',
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
            this.router.navigate(['/account/login']);
          },
          error: (err) => {
            this.router.navigate(['/error']);            
            console.error(err);
          }
        });
      //} else {
      //  // show password too weak error
      //}
    }
  }
}
