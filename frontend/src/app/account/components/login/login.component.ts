
import { ChangeDetectorRef, Component, ChangeDetectionStrategy } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { RETURN_URL_PARAM, safeReturnUrl } from '../../services/return-url';

@Component({
  selector: 'app-login',
  imports: [ReactiveFormsModule, RouterModule],
  templateUrl: './login.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './login.component.css'
})
export class LoginComponent {
  loginForm: FormGroup;
  isLoading = false;
  errorMessage = '';

  constructor(
    private fb: FormBuilder,
    private authService: AuthService,
    private router: Router,
    private route: ActivatedRoute,
    private cdr: ChangeDetectorRef
  ) {
    this.loginForm = this.fb.group({
      email: ['', Validators.required],
      password: ['', Validators.required]
    });
  }

  onSubmit() {
    if (this.loginForm.valid) {
      this.isLoading = true;
      this.errorMessage = '';
      this.cdr.detectChanges();
      
      this.authService.login(this.loginForm.value).subscribe({
        next: () => {
          this.isLoading = false;
          this.cdr.detectChanges();
          // Back to the page the user was on before logging in (validated: same-site paths only)
          this.router.navigateByUrl(safeReturnUrl(this.route.snapshot.queryParamMap.get(RETURN_URL_PARAM)));
        },
        error: (err) => {
          this.isLoading = false;
          
          if (err.status === 403) {
            this.errorMessage = 'Access denied - Please check your credentials';
          } else {
            this.errorMessage = err.error?.message || 'An error occurred during login';
          }
          
          this.cdr.detectChanges();
          console.error(err);
        }
      });
    }
  }

  clearError() {
    this.errorMessage = '';
    this.cdr.detectChanges();
  }
}
