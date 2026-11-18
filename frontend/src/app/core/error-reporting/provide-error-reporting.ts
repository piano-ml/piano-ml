import { DestroyRef, ErrorHandler, EnvironmentProviders, PLATFORM_ID, Provider, inject, makeEnvironmentProviders, provideEnvironmentInitializer } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { ErrorReporter } from './error-reporter.service';
import { ReportingErrorHandler } from './reporting-error-handler';

/**
 * Reports uncaught errors and unhandled promise rejections to the backend (issue #409); pair with
 * errorReportInterceptor for failed API calls. Browser only: server-side rendering errors are out of scope.
 */
export function provideErrorReporting(): EnvironmentProviders {
  const providers: (Provider | EnvironmentProviders)[] = [
    { provide: ErrorHandler, useClass: ReportingErrorHandler },
    provideEnvironmentInitializer(() => {
      if (!isPlatformBrowser(inject(PLATFORM_ID))) {
        return;
      }
      const reporter = inject(ErrorReporter);
      // Rejections inside the Angular zone already reach the ErrorHandler; the reporter drops the duplicate.
      const listener = (event: PromiseRejectionEvent) => reporter.reportError(event.reason, { unhandledRejection: true });
      window.addEventListener('unhandledrejection', listener);
      inject(DestroyRef).onDestroy(() => window.removeEventListener('unhandledrejection', listener));
    }),
  ];
  return makeEnvironmentProviders(providers);
}
