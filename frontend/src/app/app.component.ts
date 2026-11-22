import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { LoadingSpinnerComponent } from './shared/components/loading-spinner/loading-spinner.component';
import { RouteLoadingService } from './shared/services/route-loading.service';
import { BeaconOverlay, BeaconService } from 'ng-beacon';

import { RemoteCoachComponent } from './coach/remote/remote-coach.component';
@Component({
  selector: 'app-root',
  imports: [RouterOutlet, LoadingSpinnerComponent, BeaconOverlay, RemoteCoachComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(document:keydown.enter)': 'onEnter($event)',
  },
})
export class AppComponent {
  title = 'piano-ml';

  readonly beaconService = inject(BeaconService);
  // Initialiser le service de loading des routes
  private routeLoadingService = inject(RouteLoadingService);

  /**
   * Enter goes to the next step of any tour (the workbench's, the calibration's...), as the arrow keys do
   * (ng-beacon handles those). The key's default action is prevented: a button that has the focus, in the page or
   * in the tour itself, is not clicked as well.
   */
  onEnter(event: Event): void {
    if (!this.beaconService.isActive() || (event as KeyboardEvent).isComposing) {
      return;
    }
    event.preventDefault();
    this.beaconService.next();
  }
}
