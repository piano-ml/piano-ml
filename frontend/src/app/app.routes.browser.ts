import type { Routes } from '@angular/router';

/**
 * Routes spécifiques au navigateur (client-only)
 * Ces routes utilisent des APIs incompatibles avec Node.js (Web Audio, __dirname, etc.)
 * et ne doivent être chargées que côté client
 */
export const browserOnlyRoutes: Routes = [
    {
        path: 'work',
        loadChildren: () => import('./desktop/desktop.module').then(m => m.DesktopModule),
        data: { breadcrumb: 'Practice' }
    },
    {
        path: 'desktop',
        loadChildren: () => import('./desktop/desktop.module').then(m => m.DesktopModule),
        data: { breadcrumb: 'Desktop' }
    },
    {
        path: 'workbench',
        loadChildren: () => import('./desktop/desktop.module').then(m => m.DesktopModule),
        data: { breadcrumb: 'Workbench' }
    }
];
