import { Injectable, InjectionToken, Injector, computed, inject, signal } from '@angular/core';
import type { BridgeState, RemoteBridgeService } from './remote-bridge.service';
import { CoachGrantPresenceService } from './coach-grant-presence.service';

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

/** The blog post that presents the feature: where the switch leads while it is not available. */
export const REMOTE_COACH_DOC = '/blog/ai-coach';

/** What the switches show: the bridge state, or `unavailable` when there is no grant that can drive the player. */
export type RemoteCoachLook = BridgeState | 'unavailable';

/**
 * The Remote coach switch state (issue #414), shared by the header switch, the workbench switch and the
 * confirmation dialog. Off by default, on after a confirmation, never remembered across page loads.
 */
@Injectable({ providedIn: 'root' })
export class RemoteCoachService {
  private readonly injector = inject(Injector);
  private readonly loadBridge = inject(REMOTE_BRIDGE_LOADER);
  private readonly grants = inject(CoachGrantPresenceService);

  readonly bridge = signal<RemoteBridgeService | null>(null);
  readonly confirming = signal(false);
  private confirmed = false;

  readonly state = computed<BridgeState>(() => this.bridge()?.state() ?? 'off');
  readonly on = computed(() => this.state() === 'on' || this.state() === 'connecting');
  readonly lastClient = computed(() => this.bridge()?.lastClient() ?? null);
  readonly audioLocked = computed(() => this.bridge()?.audioLocked() ?? false);
  /** A live grant that can drive the player, or still on (turned on from the Connect page, or after a revocation). */
  readonly available = computed(() => this.grants.hasPlayerGrant() || this.state() !== 'off');
  readonly look = computed<RemoteCoachLook>(() => (this.available() ? this.state() : 'unavailable'));

  readonly tooltip = computed(() => {
    switch (this.look()) {
      case 'unavailable':
        return $localize`:@@coach.remote.learnMore:Learn about the AI coach`;
      case 'connecting':
        return $localize`:@@coach.remote.connecting:Connecting…`;
      case 'error':
        return $localize`:@@coach.remote.error:Remote coach could not connect`;
      case 'on': {
        const client = this.lastClient();
        return client
          ? $localize`:@@coach.remote.controlledBy:Controlled by ${client}:INTERPOLATION:`
          : $localize`:@@coach.remote.waiting:Remote coach on`;
      }
      default:
        return $localize`:@@coach.connect.turnOn:Turn on Remote coach`;
    }
  });

  toggle(): void {
    if (this.on()) {
      this.bridge()?.disable();
    } else if (this.confirmed) {
      void this.start();
    } else {
      this.confirming.set(true);
    }
  }

  /** Opens the confirmation unless it is already on (the ?remoteCoach=1 link). It enables nothing. */
  ask(): void {
    if (!this.on()) {
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
}
