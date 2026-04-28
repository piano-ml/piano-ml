import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { LoadingSpinnerComponent } from './shared/components/loading-spinner/loading-spinner.component';
import { RouteLoadingService } from './shared/services/route-loading.service';
import { BeaconOverlay, BeaconService } from 'ng-beacon';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, LoadingSpinnerComponent, BeaconOverlay],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppComponent {
  title = 'piano-ml';

  readonly beaconService = inject(BeaconService);
  // Initialiser le service de loading des routes
  private routeLoadingService = inject(RouteLoadingService);
}
