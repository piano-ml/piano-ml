import { type ApplicationConfig, inject, provideZoneChangeDetection } from '@angular/core';
import { IsActiveMatchOptions, provideRouter, Router, withInMemoryScrolling, withRouterConfig, withViewTransitions } from '@angular/router';
import { provideAnimations } from '@angular/platform-browser/animations';

import { routes } from './app.routes';
import { provideNgIconLoader, withCaching } from '@ng-icons/core';
import { HttpClient, provideHttpClient } from '@angular/common/http';

import { provideShareButtonsOptions } from 'ngx-sharebuttons';
import { shareIcons } from 'ngx-sharebuttons/icons';
import { provideApi } from './core/api';
import { environment } from '../environments/environment';


export const appConfig: ApplicationConfig = {
  providers: [
    provideHttpClient(),
    provideApi(environment.api),
    provideNgIconLoader(name => {
      const http = inject(HttpClient);
      return http.get(`/assets/svg/${name}.svg`, { responseType: 'text' });
    }, withCaching()),
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes,
      withViewTransitions({
        onViewTransitionCreated: ({ transition }) => {
          const router = inject(Router);
          // biome-ignore lint/style/noNonNullAssertion: <explanation>
          const targetUrl = router.getCurrentNavigation()?.finalUrl!;
          // Skip the transition if the only thing
          // changing is the fragment and queryParams
          const config = {
            paths: 'exact',
            matrixParams: "ignored",
            fragment: "ignored",
            queryParams: 'ignored',
          } as IsActiveMatchOptions;
          if (router.isActive(targetUrl, config)) {
            transition.skipTransition();
          }
        },
      }
      ),
      withRouterConfig({
        onSameUrlNavigation: 'reload',
      }),
      withInMemoryScrolling(
        {
          anchorScrolling: 'enabled',
          scrollPositionRestoration: 'top'
        }

      )),
    provideAnimations(),
    provideShareButtonsOptions(
      shareIcons()
    )
  ]
};
