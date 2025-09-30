import { Injectable, inject } from '@angular/core';
import { NavigationStart, NavigationEnd, NavigationCancel, NavigationError, Router } from '@angular/router';
import { LoadingService } from './loading.service';

@Injectable({
  providedIn: 'root'
})
export class RouteLoadingService {
  private router = inject(Router);
  private loadingService = inject(LoadingService);

  constructor() {
    this.initRouteLoadingHandlers();
  }

  private initRouteLoadingHandlers(): void {
    this.router.events.subscribe(event => {
      if (event instanceof NavigationStart) {
        // Démarrer le spinner lors du début de navigation
        this.loadingService.show();
      } else if (
        event instanceof NavigationEnd ||
        event instanceof NavigationCancel ||
        event instanceof NavigationError
      ) {
        // Arrêter le spinner lorsque la navigation se termine (succès, annulation ou erreur)
        this.loadingService.hide();
      }
    });
  }
}