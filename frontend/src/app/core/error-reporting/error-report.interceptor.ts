import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ErrorReporter } from './error-reporter.service';
import { SKIP_ERROR_REPORT, sanitizeUrl } from './error-reporting.config';

/**
 * Reports failed API calls that are not the client's fault: network failures (status 0) and 5xx. 4xx are
 * expected (validation, not logged in, not found...). Never reports the reports themselves (no loop), nor the
 * admin error pages (issue #410). Must be the outermost interceptor, to see the final outcome of retries.
 */
export const errorReportInterceptor: HttpInterceptorFn = (req, next) => {
  if (req.context.get(SKIP_ERROR_REPORT) || !req.url.startsWith(environment.api)
    || req.url.includes('/error-report')) {
    return next(req);
  }
  const reporter = inject(ErrorReporter);
  return next(req).pipe(
    catchError((error: unknown) => {
      if (error instanceof HttpErrorResponse && (error.status === 0 || error.status >= 500)) {
        const api = sanitizeUrl(req.urlWithParams);
        reporter.report({
          message: `HTTP ${error.status} ${req.method} ${api.split('?')[0]}`,
          exceptionType: 'HttpErrorResponse',
          context: { api, method: req.method, status: error.status },
        });
      }
      return throwError(() => error);
    }),
  );
};
