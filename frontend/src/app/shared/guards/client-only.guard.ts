import { inject, PLATFORM_ID } from '@angular/core';
import { CanMatchFn } from '@angular/router';
import { isPlatformBrowser } from '@angular/common';

/**
 * Guard pour empêcher le chargement de routes côté serveur
 * Utiliser avec canMatch pour empêcher complètement le chargement du module
 */
export const clientOnlyGuard: CanMatchFn = (route) => {
  const platformId = inject(PLATFORM_ID);
  return isPlatformBrowser(platformId);
};
