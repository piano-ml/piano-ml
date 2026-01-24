import { RenderMode, ServerRoute } from '@angular/ssr';

export const serverRoutes: ServerRoute[] = [
  // Routes workbench - prérendu côté client uniquement pour éviter les problèmes SSR
  // Ces routes utilisent Web Audio API, localStorage et d'autres APIs browser-only
  {
    path: 'work/**',
    renderMode: RenderMode.Client
  },
  {
    path: 'workbench/**',
    renderMode: RenderMode.Client
  },
  {
    path: 'desktop/**',
    renderMode: RenderMode.Client
  },
  
  // Toutes les autres routes utilisent le SSR
  {
    path: '**',
    renderMode: RenderMode.Server
  }
];
