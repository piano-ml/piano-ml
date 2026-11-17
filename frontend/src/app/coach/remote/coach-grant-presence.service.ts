import { Injectable, inject, signal } from '@angular/core';
import { AccountGrantsService, CoachGrantScope, type CoachGrantApiInfo } from '../../core/api';

/**
 * Whether the user has an access that can drive the player (issue #414): a live grant (not revoked, not expired)
 * with the player scope. The Remote coach switch shows only then, so that users who never connected an assistant,
 * or a deployment without the coach backend, see nothing.
 */
@Injectable({ providedIn: 'root' })
export class CoachGrantPresenceService {
  private readonly api = inject(AccountGrantsService);

  readonly hasPlayerGrant = signal(false);

  /** Asks the server. A failure (no coach backend, network) counts as no grant. */
  refresh(): void {
    this.api.accountGrantsGet().subscribe({
      next: grants => this.update(grants),
      error: () => this.hasPlayerGrant.set(false),
    });
  }

  /** From a grant list already loaded elsewhere (the account and Connect pages), without asking again. */
  update(grants: readonly CoachGrantApiInfo[]): void {
    const now = Date.now();
    this.hasPlayerGrant.set(grants.some(grant =>
      !grant.revokedAt
      && new Date(grant.expiresAt).getTime() > now
      && grant.scopes.includes(CoachGrantScope.PlayerControl)));
  }

  reset(): void {
    this.hasPlayerGrant.set(false);
  }
}
