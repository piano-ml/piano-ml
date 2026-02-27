import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError } from 'rxjs/operators';
import { throwError } from 'rxjs';
import { SessionStorageService } from '../services/session-storage.service';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const router = inject(Router);
  const sessionStorage = inject(SessionStorageService);
  
  return next(req).pipe(
    catchError(error => {
      if (error.status === 401 || error.status === 403) {
        console.info('Unauthorized access detected, clearing session');
        
        // Clear session data
        sessionStorage.clearSession();
        
        // Redirect to login page
        const target = '/account/login';
        if (router.url !== target) {
          router.navigate([target]);
        }
      }
      return throwError(() => error);
    })
  );
};
