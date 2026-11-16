import { ChangeDetectionStrategy, Component, LOCALE_ID, OnInit, inject, input, output, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { AccountGrantsService, CoachGrantScope, type CoachGrantApiInfo } from '../../../core/api';

export const SCOPES: readonly CoachGrantScope[] = [
  CoachGrantScope.PracticeRead,
  CoachGrantScope.ScoresRead,
  CoachGrantScope.PlayerControl,
];

export const SCOPE_LABELS: Record<CoachGrantScope, string> = {
  'practice:read': $localize`:@@coach.grants.scope.practice:Practice history`,
  'scores:read': $localize`:@@coach.grants.scope.scores:Score library`,
  'player:control': $localize`:@@coach.grants.scope.player:Player`,
};

export const SCOPE_HINTS: Record<CoachGrantScope, string> = {
  'practice:read': $localize`:@@coach.grants.scope.practice.hint:Read your sessions, accuracy, streaks and level.`,
  'scores:read': $localize`:@@coach.grants.scope.scores.hint:Search and read the scores of the library.`,
  'player:control': $localize`:@@coach.grants.scope.player.hint:Open scores and start or stop the player in a tab where you turned on Remote coach.`,
};

export const EXPIRY_DAYS = [30, 90, 180, 365] as const;

const ERROR_TOO_MANY = $localize`:@@coach.grants.error.tooMany:You already have 5 active accesses. Revoke one first.`;
const ERROR_RATE_LIMITED = $localize`:@@coach.grants.error.rateLimited:Too many accesses created in the last hour. Try again later.`;
const ERROR_CREATE = $localize`:@@coach.grants.error.create:The access could not be created. Try again later.`;
const ERROR_REVOKE = $localize`:@@coach.grants.error.revoke:The access could not be revoked. Try again later.`;

/**
 * Access for external AI tools on the account page (coach, issue #414): the user's grants, the form that
 * creates one, the token shown once, and revocation. The token itself is never stored or sent anywhere by
 * the app: it is shown once, for the user to copy into their tool.
 */
@Component({
  selector: 'app-coach-grants',
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './coach-grants.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CoachGrantsComponent implements OnInit {
  private readonly api = inject(AccountGrantsService);
  private readonly locale = inject(LOCALE_ID);
  private readonly fb = inject(FormBuilder);

  protected readonly scopes = SCOPES;
  protected readonly scopeLabels = SCOPE_LABELS;
  protected readonly scopeHints = SCOPE_HINTS;
  protected readonly expiryDays = EXPIRY_DAYS;

  readonly grants = signal<CoachGrantApiInfo[]>([]);
  readonly loaded = signal(false);
  readonly formOpen = signal(false);
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);
  /** The token of the grant just created: shown once, forgotten when the user closes it. */
  readonly createdToken = signal<string | null>(null);
  readonly copyState = signal<'idle' | 'copied' | 'failed'>('idle');
  readonly confirmingRevoke = signal<string | null>(null);
  /** The token of a grant just created, for a host page that fills configuration snippets with it. */
  readonly created = output<string>();
  /** The link to the Connect page: on the account page, not on the Connect page itself. */
  readonly showConnectLink = input(true);

  readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(80), Validators.pattern(/\S/)]],
    'practice:read': [true],
    'scores:read': [true],
    'player:control': [true],
    expiresInDays: [90],
  });

  ngOnInit(): void {
    this.load();
  }

  private load(): void {
    this.api.accountGrantsGet().subscribe({
      next: grants => {
        this.grants.set(grants);
        this.loaded.set(true);
      },
      // A failure leaves the list empty: the rest of the account page does not depend on it
      error: () => this.loaded.set(true),
    });
  }

  selectedScopes(): CoachGrantScope[] {
    const value = this.form.getRawValue();
    return this.scopes.filter(scope => value[scope]);
  }

  canSubmit(): boolean {
    return this.form.valid && this.selectedScopes().length > 0 && !this.saving();
  }

  openForm(): void {
    this.form.reset();
    this.error.set(null);
    this.formOpen.set(true);
  }

  create(): void {
    if (!this.canSubmit()) {
      return;
    }
    const value = this.form.getRawValue();
    this.saving.set(true);
    this.error.set(null);
    this.api.accountGrantsPost({
      name: value.name.trim(),
      scopes: this.selectedScopes(),
      expiresInDays: Number(value.expiresInDays),
    }).subscribe({
      next: created => {
        this.saving.set(false);
        this.formOpen.set(false);
        this.copyState.set('idle');
        this.createdToken.set(created.token);
        this.created.emit(created.token);
        this.load();
      },
      error: (e: unknown) => {
        this.saving.set(false);
        const status = e instanceof HttpErrorResponse ? e.status : 0;
        this.error.set(status === 409 ? ERROR_TOO_MANY : status === 429 ? ERROR_RATE_LIMITED : ERROR_CREATE);
      },
    });
  }

  async copyToken(): Promise<void> {
    const token = this.createdToken();
    if (!token) {
      return;
    }
    try {
      await navigator.clipboard.writeText(token);
      this.copyState.set('copied');
    } catch {
      this.copyState.set('failed');
    }
  }

  closeToken(): void {
    this.createdToken.set(null);
    this.copyState.set('idle');
  }

  revoke(id: string): void {
    this.api.accountGrantsIdDelete(id).subscribe({
      next: () => {
        this.confirmingRevoke.set(null);
        this.load();
      },
      error: () => {
        this.confirmingRevoke.set(null);
        this.error.set(ERROR_REVOKE);
      },
    });
  }

  status(grant: CoachGrantApiInfo): 'active' | 'revoked' | 'expired' {
    if (grant.revokedAt) {
      return 'revoked';
    }
    return new Date(grant.expiresAt).getTime() <= Date.now() ? 'expired' : 'active';
  }

  date(iso: string): string {
    return new Intl.DateTimeFormat(this.locale, { dateStyle: 'medium' }).format(new Date(iso));
  }

  scopeList(grant: CoachGrantApiInfo): string {
    return grant.scopes.map(scope => this.scopeLabels[scope] ?? scope).join(' · ');
  }
}
