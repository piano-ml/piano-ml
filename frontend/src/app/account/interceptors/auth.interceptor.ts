import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError } from 'rxjs/operators';
import { throwError } from 'rxjs';
import { AuthService } from '../services/auth.service';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const authService = inject(AuthService);
  const router = inject(Router);
  const token = authService.getToken();

  if (token) {
    const cloned = req.clone({
      headers: req.headers.set('Authorization', `Bearer ${token}`)
    });    
    return next(cloned).pipe(
      catchError(error => {
        if (error.status === 403) {
          console.log('403 Forbidden - Redirecting to login');
          // Clear the invalid token
          authService.logout();
          // Redirect to login page
          router.navigate(['/account/login']);
        }
        return throwError(() => error);
      })
    );
  }

  return next(req).pipe(
    catchError(error => {
      if (error.status === 403) {
        console.log('403 Forbidden - Redirecting to login');
        router.navigate(['/account/login']);
      }
      return throwError(() => error);
    })
  );
};
