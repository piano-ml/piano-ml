import { HttpContext, HttpErrorResponse } from '@angular/common/http';
import { Injectable, Injector, PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { ActivatedRouteSnapshot, Router } from '@angular/router';
import { ErrorReportCreate, ErrorReportLevel, ErrorReportService } from '../api';
import { ERROR_REPORTING_CONFIG, SKIP_ERROR_REPORT, sanitizeUrl } from './error-reporting.config';

/** What the app knows about an error; the reporter adds url, route and release. */
export interface ErrorReportInput {
  message: string;
  exceptionType?: string;
  stackTrace?: string;
  level?: ErrorReportLevel;
  context?: Record<string, unknown>;
}

const MAX_MESSAGE = 10_000;
const MAX_STACK = 100_000;

/**
 * Sends the app's runtime errors to the backend (POST /error-report, issue #409), in the browser only.
 * <p>
 * The error path must never make things worse: every method swallows its own failures, identical reports
 * within a few seconds are dropped, and a page load sends a bounded number of reports.
 * The user is not sent: the backend reads it from the session cookie.
 */
@Injectable({ providedIn: 'root' })
export class ErrorReporter {
  private readonly config = inject(ERROR_REPORTING_CONFIG);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  // Lazy: the reporter is reached from the ErrorHandler, which exists before the router and HttpClient
  private readonly injector = inject(Injector);

  private sent = 0;
  private readonly recent = new Map<string, number>();
  private release: Promise<string | undefined> | null = null;

  /** An uncaught error or rejection: any value can be thrown. */
  reportError(error: unknown, context?: Record<string, unknown>): void {
    try {
      // HTTP failures are reported by errorReportInterceptor (status 0 and 5xx only)
      if (error instanceof HttpErrorResponse) {
        return;
      }
      const e = error instanceof Error ? error : null;
      this.report({
        message: e ? e.message : stringify(error),
        exceptionType: e ? e.name || e.constructor?.name : typeof error,
        // A value thrown without a stack (a string, a rejected object): where it was reported from, at least
        stackTrace: e?.stack || reportedFrom(),
        context,
      });
    } catch {
      // never throw from the error path
    }
  }

  report(input: ErrorReportInput): void {
    try {
      if (!this.isBrowser || !this.config.enabled || this.sent >= this.config.maxPerPage) {
        return;
      }
      const route = this.routePath();
      const key = `${input.message}\n${firstFrame(input.stackTrace)}\n${route}`;
      const now = Date.now();
      const last = this.recent.get(key);
      if (last !== undefined && now - last < this.config.dedupMs) {
        return;
      }
      this.recent.set(key, now);
      this.sent++;
      const body: ErrorReportCreate = {
        url: sanitizeUrl(window.location.href),
        level: input.level ?? ErrorReportLevel.Error,
        message: (input.message || '(no message)').substring(0, MAX_MESSAGE),
        exceptionType: input.exceptionType?.substring(0, 255),
        stackTrace: input.stackTrace?.substring(0, MAX_STACK),
        context: { route, ...input.context },
      };
      this.releaseVersion().then(release => this.send({ ...body, release }), () => this.send(body));
    } catch {
      // never throw from the error path
    }
  }

  private send(body: ErrorReportCreate): void {
    try {
      this.injector.get(ErrorReportService)
        .errorReportPost(body, 'body', false, { context: new HttpContext().set(SKIP_ERROR_REPORT, true) })
        .subscribe({ error: () => undefined });
    } catch {
      // never throw from the error path
    }
  }

  /** The matched route pattern ("score/:slug"), which groups errors better than the URL. */
  private routePath(): string {
    try {
      let snapshot: ActivatedRouteSnapshot | null = this.injector.get(Router).routerState.snapshot.root;
      const parts: string[] = [];
      while (snapshot) {
        const path = snapshot.routeConfig?.path;
        if (path) {
          parts.push(path);
        }
        snapshot = snapshot.firstChild;
      }
      return '/' + parts.join('/');
    } catch {
      return '';
    }
  }

  /** The commit of this build (assets/version.json, written at build time), fetched once on the first report. */
  private releaseVersion(): Promise<string | undefined> {
    this.release ??= fetch('/assets/version.json')
      .then(response => (response.ok ? response.json() : undefined))
      .then(info => (typeof info?.commit === 'string' ? info.commit.substring(0, 100) : undefined))
      .catch(() => undefined);
    return this.release;
  }
}

function stringify(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}

/** The current stack, without its first line ("Error") and the reporter's own frames. */
function reportedFrom(): string | undefined {
  const stack = new Error().stack;
  return stack?.split('\n').slice(1).filter(line => !line.includes('reportedFrom') && !line.includes('reportError')).join('\n') || undefined;
}

function firstFrame(stack: string | undefined): string {
  return stack?.split('\n').map(line => line.trim()).find(line => line.startsWith('at ') || line.includes('@')) ?? '';
}
