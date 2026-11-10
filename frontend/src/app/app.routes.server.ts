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
  {
    path: 'work',
    renderMode: RenderMode.Client
  },
  {
    path: 'workbench',
    renderMode: RenderMode.Client
  },
  {
    path: 'desktop',
    renderMode: RenderMode.Client
  },
  
  // Private pages: the session lives in the browser (localStorage + HttpOnly cookie sent by the browser), so
  // server-side rendering always sees a logged-out visitor and redirected /account/home to /account/login on
  // reload. They have no SEO value: render them in the browser only.
  {
    path: 'account/**',
    renderMode: RenderMode.Client
  },
  {
    path: 'account',
    renderMode: RenderMode.Client
  },
  {
    path: 'import/**',
    renderMode: RenderMode.Client
  },
  {
    path: 'import',
    renderMode: RenderMode.Client
  },

  // Toutes les autres routes utilisent le SSR
  {
    path: '**',
    renderMode: RenderMode.Server
  }
];
