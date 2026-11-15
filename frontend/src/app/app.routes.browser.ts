import type { Routes } from '@angular/router';
import { ROUTE_LABELS } from './shared/i18n/route-labels';

/**
 * Routes spécifiques au navigateur (client-only)
 * Ces routes utilisent des APIs incompatibles avec Node.js (Web Audio, __dirname, etc.)
 * et ne doivent être chargées que côté client
 */
export const browserOnlyRoutes: Routes = [
    {
        path: 'work',
        loadChildren: () => import('./desktop/desktop.module').then(m => m.DesktopModule),
        data: { breadcrumb: ROUTE_LABELS.practice }
    },
    {
        path: 'desktop',
        loadChildren: () => import('./desktop/desktop.module').then(m => m.DesktopModule),
        data: { breadcrumb: ROUTE_LABELS.desktop }
    },
    {
        path: 'workbench',
        loadChildren: () => import('./desktop/desktop.module').then(m => m.DesktopModule),
        data: { breadcrumb: ROUTE_LABELS.workbench }
    }
];
