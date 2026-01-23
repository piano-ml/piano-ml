import { type ApplicationConfig, inject, provideZoneChangeDetection, LOCALE_ID, PLATFORM_ID, APP_INITIALIZER } from '@angular/core';
import { IsActiveMatchOptions, provideRouter, Router, withInMemoryScrolling, withRouterConfig, withViewTransitions } from '@angular/router';
import { provideAnimations } from '@angular/platform-browser/animations';
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

import { provideShareButtonsOptions } from 'ngx-sharebuttons';
import { shareIcons } from 'ngx-sharebuttons/icons';
import { provideApi } from './core/api';
import { environment } from '../environments/environment';
import { provideClientHydration, withEventReplay } from '@angular/platform-browser';

/**
 * Initializer pour charger les routes browser-only dynamiquement
 * Ces routes ne doivent être ajoutées que côté client pour éviter
 * les erreurs SSR liées à __dirname, Web Audio API, etc.
 */
function loadBrowserOnlyRoutes() {
  const platformId = inject(PLATFORM_ID);
  const router = inject(Router);
  
  return () => {
    if (isPlatformBrowser(platformId)) {
      // Charger les routes browser-only uniquement côté client
      import('./app.routes.browser').then(m => {
        const config = router.config;
        // Insérer les routes avant la route wildcard (**)
        const wildcardIndex = config.findIndex(r => r.path === '**');
        if (wildcardIndex !== -1) {
          config.splice(wildcardIndex, 0, ...m.browserOnlyRoutes);
        } else {
          config.push(...m.browserOnlyRoutes);
        }
        router.resetConfig(config);
      });
    }
  };
}

export const appConfig: ApplicationConfig = {
  providers: [
    {
      provide: APP_INITIALIZER,
      useFactory: loadBrowserOnlyRoutes,
      multi: true
    },
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
    ), provideClientHydration(withEventReplay())
  ]
};
