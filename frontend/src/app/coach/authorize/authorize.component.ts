import { ChangeDetectionStrategy, Component, InjectionToken, OnInit, PLATFORM_ID, computed, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { CoachGrantScope, OauthService, type OAuthRequestView } from '../../core/api';
import { SessionStorageService } from '../../account/services/session-storage.service';
import { LOGIN_PATH, loginQueryParams } from '../../account/services/return-url';
import { SCOPES, SCOPE_HINTS, SCOPE_LABELS } from '../../account/components/coach-grants/coach-grants.component';

/** Leaves the app for the application's redirect URI. A token so that specs can watch it. */
export const LEAVE_APP = new InjectionToken<(url: string) => void>('LEAVE_APP', {
  factory: () => (url: string) => window.location.assign(url),
});

type State = 'loading' | 'ready' | 'sending' | 'gone' | 'error';

/**
 * Consent page of the coach OAuth server (issue #414, docs/coach-oauth-design.md 2.3): an application connecting
 * PianoML as an MCP server sent the user here, through GET /oauth/authorize. Shows who asks (the metadata URL's
 * host, or a warning that the name is self-declared), where the browser goes next, and the permissions; the user
 * allows, possibly fewer permissions, or refuses, and is sent back to the application.
 *
 * <p>Same site as the API, so the session cookie travels on these calls although the user arrived from another
 * site. Rendered in the browser only; the SSR server forbids framing it.
 */
@Component({
  selector: 'app-coach-authorize',
  imports: [RouterLink],
  templateUrl: './authorize.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AuthorizeComponent implements OnInit {
  private readonly api = inject(OauthService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly session = inject(SessionStorageService);
  private readonly leave = inject(LEAVE_APP);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  protected readonly scopeLabels = SCOPE_LABELS;
  protected readonly scopeHints = SCOPE_HINTS;

  readonly state = signal<State>('loading');
  readonly request = signal<OAuthRequestView | null>(null);
  readonly chosen = signal<ReadonlySet<CoachGrantScope>>(new Set());
  readonly decisionFailed = signal(false);

  /** The requested scopes, in the usual order. */
  readonly scopes = computed(() => SCOPES.filter(s => this.request()?.scopes.includes(s)));
  readonly canAllow = computed(() => this.chosen().size > 0 && this.state() === 'ready');
  private requestId = '';

  ngOnInit(): void {
    if (!this.isBrowser) {
      return;
    }
    this.requestId = this.route.snapshot.queryParamMap.get('request') ?? '';
    if (!this.requestId) {
      this.state.set('gone');
      return;
    }
    if (!this.session.getUserId()) {
      void this.router.navigate([LOGIN_PATH], { queryParams: loginQueryParams(this.router.url) });
      return;
    }
    this.api.oauthRequestsIdGet(this.requestId).subscribe({
      next: request => {
        this.request.set(request);
        this.chosen.set(new Set(request.scopes));
        this.state.set('ready');
      },
      error: (e: unknown) => this.state.set(e instanceof HttpErrorResponse && e.status === 404 ? 'gone' : 'error'),
    });
  }

  isChosen(scope: CoachGrantScope): boolean {
    return this.chosen().has(scope);
  }

  toggle(scope: CoachGrantScope): void {
    const next = new Set(this.chosen());
    if (!next.delete(scope)) {
      next.add(scope);
    }
    this.chosen.set(next);
  }

  allow(): void {
    if (this.canAllow()) {
      this.decide(true);
    }
  }

  refuse(): void {
    if (this.state() === 'ready') {
      this.decide(false);
    }
  }

  private decide(approve: boolean): void {
    this.state.set('sending');
    this.decisionFailed.set(false);
    const scopes = approve ? this.scopes().filter(s => this.chosen().has(s)) : undefined;
    this.api.oauthRequestsIdDecisionPost(this.requestId, { approve, scopes }).subscribe({
      next: result => this.leave(result.redirectUrl),
      error: (e: unknown) => {
        if (e instanceof HttpErrorResponse && e.status === 404) {
          this.state.set('gone');
        } else {
          this.state.set('ready');
          this.decisionFailed.set(true);
        }
      },
    });
  }
}
