import { Injectable, RESPONSE_INIT, inject } from '@angular/core';

/**
 * Sets the HTTP status of the server-rendered response.
 *
 * Without this, a page that cannot find what its URL asked for still answers
 * 200, which search engines read as a soft 404 — and the URL space of possible
 * slugs is unbounded.
 */
@Injectable({ providedIn: 'root' })
export class ResponseStatusService {
  // Null when rendering in the browser or when prerendering.
  private response = inject(RESPONSE_INIT, { optional: true });

  /** No-op in the browser, where the response has already been sent. */
  set(status: number): void {
    if (this.response) {
      this.response.status = status;
    }
  }
}
