import { inject, PLATFORM_ID } from '@angular/core';
import { CanMatchFn } from '@angular/router';
import { isPlatformBrowser } from '@angular/common';

/**
 * Guard pour empêcher le chargement de routes côté serveur
 * Utiliser avec canMatch pour empêcher complètement le chargement du module
 */
export const clientOnlyGuard: CanMatchFn = (route) => {
  const platformId = inject(PLATFORM_ID);
  const isBrowser = isPlatformBrowser(platformId);
  
  if (!isBrowser) {
    console.warn(`[clientOnlyGuard] Blocked server-side access to route: ${route.path}`);
  } else {
        console.warn(`[clientOnlyGuard] Allowed client-side access to route: ${route.path}`);
  }
  
  // Retourner true uniquement côté client
  // Côté serveur, cela empêchera le chargement du module
  return isBrowser;
};
