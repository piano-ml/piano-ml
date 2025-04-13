import { type ApplicationConfig, inject, provideZoneChangeDetection } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideAnimations } from '@angular/platform-browser/animations';

import { routes } from './app.routes';
import { provideNgIconLoader, withCaching } from '@ng-icons/core';
import { HttpClient, provideHttpClient } from '@angular/common/http';

export const appConfig: ApplicationConfig = {
  providers: [
    provideHttpClient(),
    provideNgIconLoader(name => {
      const http = inject(HttpClient);
      return http.get(`/assets/svg/${name}.svg`, { responseType: 'text' });
    }, withCaching()),
    provideZoneChangeDetection({ eventCoalescing: true }), 
    provideRouter(routes),
    provideAnimations()
  ]
};
