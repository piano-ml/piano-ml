import { HttpContext, HttpErrorResponse } from '@angular/common/http';
import { SKIP_ERROR_REPORT } from '../../core/error-reporting/error-reporting.config';

/** Admin calls are never reported back through the error reporter (issue #410). */
export const ADMIN_CALL = { context: new HttpContext().set(SKIP_ERROR_REPORT, true) };

export type LoadError = 'denied' | 'failed';

export function loadError(error: unknown): LoadError {
  return error instanceof HttpErrorResponse && error.status === 403 ? 'denied' : 'failed';
}

/** Only http(s) URLs become links: a report's URL is user-supplied data. */
export function linkable(url: string | undefined): boolean {
  return !!url && /^https?:\/\//i.test(url);
}
