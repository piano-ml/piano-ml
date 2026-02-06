import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError } from 'rxjs/operators';
import { throwError } from 'rxjs';
import { AuthSessionService } from '../services/auth-session.service';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const sessionService = inject(AuthSessionService);
  return next(req).pipe(
    catchError(error => {
      if (error.status === 401 || error.status === 403) {
        sessionService.handleUnauthorized();
      }
      return throwError(() => error);
    })
  );
};
