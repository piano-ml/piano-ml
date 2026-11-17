import { ChangeDetectionStrategy, Component, DestroyRef, InjectionToken, Injector, PLATFORM_ID, computed, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { toSignal, takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs';
import { SessionStorageService } from '../../account/services/session-storage.service';
import { LOGIN_PATH, loginQueryParams } from '../../account/services/return-url';
import type { BridgeState, RemoteBridgeService } from './remote-bridge.service';

/**
 * Loads the bridge, with the tool registry and the tools, the first time the switch is turned on: none of it is
 * in the initial bundle. A token so that specs need not wait for a real dynamic import.
 */
export const REMOTE_BRIDGE_LOADER = new InjectionToken<(injector: Injector) => Promise<RemoteBridgeService>>('REMOTE_BRIDGE_LOADER', {
  factory: () => async (injector: Injector) => {
    const { RemoteBridgeService } = await import('./remote-bridge.service');
    return injector.get(RemoteBridgeService);
  },
});

/** The query parameter of the link an assistant gives when no tab is listening: it opens the confirmation. */
export const REMOTE_COACH_PARAM = 'remoteCoach';

const TOOL_LABELS: Record<string, string> = {
  get_player_state: $localize`:@@coach.remote.tool.get_player_state:Checked the player`,
  list_exercises: $localize`:@@coach.remote.tool.list_exercises:Looked at the exercises`,
  open_score: $localize`:@@coach.remote.tool.open_score:Opened a score`,
  open_exercise: $localize`:@@coach.remote.tool.open_exercise:Opened an exercise`,
  configure_practice: $localize`:@@coach.remote.tool.configure_practice:Set up the practice`,
  play: $localize`:@@coach.remote.tool.play:Started playback`,
  stop: $localize`:@@coach.remote.tool.stop:Stopped playback`,
  wait_for_take_end: $localize`:@@coach.remote.tool.wait_for_take_end:Waited for the end of the take`,
  get_current_session: $localize`:@@coach.remote.tool.get_current_session:Read the current session`,
  navigate: $localize`:@@coach.remote.tool.navigate:Showed a page`,
};

/**
 * The Remote coach switch (issue #414): lets the student's AI assistant drive the player in this tab. Off by
 * default, on after a confirmation, never remembered across page loads. The bridge and the tools are loaded the
 * first time it is turned on.
 */
@Component({
  selector: 'app-remote-coach',
  templateUrl: './remote-coach.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RemoteCoachComponent {
  private readonly session = inject(SessionStorageService);
  private readonly router = inject(Router);
  private readonly injector = inject(Injector);
  private readonly loadBridge = inject(REMOTE_BRIDGE_LOADER);
  protected readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  readonly loggedIn = toSignal(this.session.isLoggedIn, { initialValue: false });
  readonly bridge = signal<RemoteBridgeService | null>(null);
  readonly confirming = signal(false);
  readonly expanded = signal(false);
  private confirmed = false;

  readonly state = computed<BridgeState>(() => this.bridge()?.state() ?? 'off');
  readonly on = computed(() => this.state() === 'on' || this.state() === 'connecting');
  readonly lastClient = computed(() => this.bridge()?.lastClient() ?? null);
  readonly activity = computed(() => this.bridge()?.activity() ?? []);
  readonly audioLocked = computed(() => this.bridge()?.audioLocked() ?? false);

  constructor() {
    if (!this.isBrowser) {
      return;
    }
    this.router.events
      .pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd), takeUntilDestroyed(inject(DestroyRef)))
      .subscribe(e => this.onNavigation(e.urlAfterRedirects));
  }

  label(tool: string): string {
    return TOOL_LABELS[tool] ?? tool;
  }

  time(at: Date): string {
    return at.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  toggle(): void {
    if (this.on()) {
      this.bridge()?.disable();
    } else if (this.confirmed) {
      void this.start();
    } else {
      this.confirming.set(true);
    }
  }

  confirm(): void {
    this.confirmed = true;
    this.confirming.set(false);
    void this.start();
  }

  dismiss(): void {
    this.confirming.set(false);
  }

  startPlayback(): void {
    void this.bridge()?.startPlayback();
  }

  private async start(): Promise<void> {
    let bridge = this.bridge();
    if (!bridge) {
      bridge = await this.loadBridge(this.injector);
      this.bridge.set(bridge);
    }
    bridge.enable();
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
    if (!this.on()) {
      this.confirming.set(true);
    }
    void this.router.navigate([], {
      queryParams: { [REMOTE_COACH_PARAM]: null },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }
}
