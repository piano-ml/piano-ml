import { type ApplicationConfig, inject, provideZoneChangeDetection, LOCALE_ID, PLATFORM_ID, provideEnvironmentInitializer } from '@angular/core';
import { IsActiveMatchOptions, NavigationStart, isActive, provideRouter, Router, withInMemoryScrolling, withRouterConfig, withViewTransitions } from '@angular/router';
import { registerLocaleData, isPlatformBrowser } from '@angular/common';

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

import { provideApi } from './core/api';
import { environment } from '../environments/environment';
import { provideClientHydration, withEventReplay } from '@angular/platform-browser';
import { provideBeacon } from 'ng-beacon';

export const appConfig: ApplicationConfig = {
  providers: [
    {
      provide: LOCALE_ID,
      useValue:  'en-US'
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
          const targetUrl = router.currentNavigation()?.finalUrl;
          if (!targetUrl) return;
          // Skip the transition if the only thing
          // changing is the fragment and queryParams
          const config: IsActiveMatchOptions = {
            paths: 'exact',
            matrixParams: 'ignored',
            fragment: 'ignored',
            queryParams: 'ignored',
          };
          if (isActive(targetUrl, router, config)()) {
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
    // Router debug initializer - logs router events on client and SSR for non-production builds
    provideEnvironmentInitializer(() => {
        const platformId = inject(PLATFORM_ID);
        const router = inject(Router);
        if (environment.production) return;

        const side = isPlatformBrowser(platformId) ? 'CLIENT' : 'SERVER';

        const originalNavigate = router.navigate.bind(router);
        const originalNavigateByUrl = router.navigateByUrl.bind(router);

        router.navigate = ((...args: Parameters<Router['navigate']>) => {
          // eslint-disable-next-line no-console
          console.groupCollapsed(`[ROUTER ${side}] navigate() called`, args[0]);
          // eslint-disable-next-line no-console
          console.trace(`[ROUTER ${side}] navigate() stack`);
          // eslint-disable-next-line no-console
          console.groupEnd();
          return originalNavigate(...args);
        }) as Router['navigate'];

        router.navigateByUrl = ((...args: Parameters<Router['navigateByUrl']>) => {
          // eslint-disable-next-line no-console
          console.groupCollapsed(`[ROUTER ${side}] navigateByUrl() called`, args[0]);
          // eslint-disable-next-line no-console
          console.trace(`[ROUTER ${side}] navigateByUrl() stack`);
          // eslint-disable-next-line no-console
          console.groupEnd();
          return originalNavigateByUrl(...args);
        }) as Router['navigateByUrl'];

        router.events.subscribe(e => {
          // eslint-disable-next-line no-console
          console.info(`[ROUTER ${side} EVENT]`, e);
          if (e instanceof NavigationStart) {
            // eslint-disable-next-line no-console
            console.info(`[ROUTER ${side}] NavigationStart trigger:`, e.navigationTrigger, 'restoredState:', e.restoredState);
          }
          // eslint-disable-next-line no-console
          if ((e as any).url) console.info(`[ROUTER ${side}] url:`, (e as any).url);
          // eslint-disable-next-line no-console
          if ((e as any).urlAfterRedirects) console.info(`[ROUTER ${side}] urlAfterRedirects:`, (e as any).urlAfterRedirects);
        });
    }),

    provideClientHydration(withEventReplay()),
    provideBeacon()
  ]
};
