import { RenderMode, ServerRoute } from '@angular/ssr';

export const serverRoutes: ServerRoute[] = [
  // Les routes desktop/work/workbench sont chargées dynamiquement côté client uniquement
  // via APP_INITIALIZER dans app.config.ts
  // Elles ne doivent pas être déclarées ici car elles n'existent pas dans app.routes.ts
  
  // Toutes les routes utilisent le SSR par défaut
  {
    path: '**',
    renderMode: RenderMode.Server
  }
];
