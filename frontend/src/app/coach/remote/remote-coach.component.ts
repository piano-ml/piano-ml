import { ChangeDetectionStrategy, Component, DestroyRef, PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router } from '@angular/router';
import { distinctUntilChanged, filter } from 'rxjs';
import { SessionStorageService } from '../../account/services/session-storage.service';
import { LOGIN_PATH, loginQueryParams } from '../../account/services/return-url';
import { CoachGrantPresenceService } from './coach-grant-presence.service';
import { RemoteCoachService } from './remote-coach.service';

/** The query parameter of the link an assistant gives when no tab is listening: it opens the confirmation. */
export const REMOTE_COACH_PARAM = 'remoteCoach';

/**
 * The Remote coach host (issue #414), in the app root so that it stays across navigation: the confirmation dialog,
 * the Start playback click the browser needs before sound, the grants on login and the ?remoteCoach=1 link. The
 * switches themselves are in the header and in the workbench toolbar (RemoteCoachToggleComponent).
 */
@Component({
  selector: 'app-remote-coach',
  templateUrl: './remote-coach.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RemoteCoachComponent {
  private readonly session = inject(SessionStorageService);
  private readonly router = inject(Router);
  private readonly grants = inject(CoachGrantPresenceService);
  protected readonly coach = inject(RemoteCoachService);
  protected readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  constructor() {
    if (!this.isBrowser) {
      return;
    }
    // The login state is announced again whenever the session is refreshed (on every page load, from the stored
    // session then from the server): only a change asks for the grants.
    this.session.isLoggedIn.pipe(distinctUntilChanged(), takeUntilDestroyed()).subscribe(loggedIn => {
      if (loggedIn) {
        this.grants.refresh();
      } else {
        this.grants.reset();
      }
    });
    this.router.events
      .pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd), takeUntilDestroyed(inject(DestroyRef)))
      .subscribe(e => this.onNavigation(e.urlAfterRedirects));
  }

  /** ?remoteCoach=1 opens the confirmation (after login when needed), then leaves the URL. It enables nothing. */
  private onNavigation(url: string): void {
    const tree = this.router.parseUrl(url);
    if (tree.queryParams[REMOTE_COACH_PARAM] !== '1') {
      return;
    }
    if (!this.session.getUserId()) {
      void this.router.navigate([LOGIN_PATH], { queryParams: loginQueryParams(url) });
      return;
    }
    this.coach.ask();
    void this.router.navigate([], {
      queryParams: { [REMOTE_COACH_PARAM]: null },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }
}
