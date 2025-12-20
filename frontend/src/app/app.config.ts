import { type ApplicationConfig, inject, provideZoneChangeDetection, LOCALE_ID } from '@angular/core';
import { IsActiveMatchOptions, provideRouter, Router, withInMemoryScrolling, withRouterConfig, withViewTransitions } from '@angular/router';
import { provideAnimations } from '@angular/platform-browser/animations';
import { registerLocaleData } from '@angular/common';

// Load common locales
import localeEn from '@angular/common/locales/en';
import localeFr from '@angular/common/locales/fr';
import localeEs from '@angular/common/locales/es';
import localeDe from '@angular/common/locales/de';
import localeIt from '@angular/common/locales/it';

// Register common locales
registerLocaleData(localeEn);
registerLocaleData(localeFr);
registerLocaleData(localeEs);
registerLocaleData(localeDe);
registerLocaleData(localeIt);

import { routes } from './app.routes';
import { provideNgIconLoader, withCaching } from '@ng-icons/core';
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { authInterceptor } from './account/interceptors/auth.interceptor';

import { provideShareButtonsOptions } from 'ngx-sharebuttons';
import { shareIcons } from 'ngx-sharebuttons/icons';
import { provideApi } from './core/api';
import { environment } from '../environments/environment';

export const appConfig: ApplicationConfig = {
  providers: [
    {
      provide: LOCALE_ID,
      useValue: navigator.language || 'en-US'
    },
    provideHttpClient(withInterceptors([authInterceptor])),
    provideApi({ basePath: environment.api, withCredentials: true }),
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
