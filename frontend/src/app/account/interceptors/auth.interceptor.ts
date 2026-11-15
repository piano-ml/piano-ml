import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError } from 'rxjs/operators';
import { throwError } from 'rxjs';
import { SessionStorageService } from '../services/session-storage.service';
import { LOGIN_PATH, loginQueryParams, requiresLogin } from '../services/return-url';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const router = inject(Router);
  const sessionStorage = inject(SessionStorageService);
  
  return next(req).pipe(
    catchError(error => {
      // Only 401 means the session is gone (no or expired JWT). A 403 is a refusal for a logged-in user
      // (not allowed, or a CSRF rejection that xsrfInterceptor already retried): keep the session.
      if (error.status === 401) {
        console.info('Unauthorized access detected, clearing session');
        
        // Clear session data
        sessionStorage.clearSession();
        
        // Only a protected page sends the user to login; on a public page they stay, logged out.
        // On a fresh visit the 401 can arrive while the first navigation is still running
        // (router.url is still "/"), so judge by where that navigation is heading.
        const url = router.getCurrentNavigation()?.extractedUrl.toString() ?? router.url;
        if (requiresLogin(url)) {
          router.navigate([LOGIN_PATH], { queryParams: loginQueryParams(url) });
        }
      }
      return throwError(() => error);
    })
  );
};
