import { ErrorHandler, Injectable, Injector, inject } from '@angular/core';
import { ErrorReporter } from './error-reporter.service';

/** Angular's ErrorHandler (logs to the console), plus a report of every uncaught error (issue #409). */
@Injectable()
export class ReportingErrorHandler extends ErrorHandler {
  private readonly injector = inject(Injector);

  override handleError(error: unknown): void {
    super.handleError(error);
    try {
      this.injector.get(ErrorReporter).reportError(error);
    } catch {
      // never throw from the error path
    }
  }
}
