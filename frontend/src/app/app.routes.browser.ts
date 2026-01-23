import type { Routes } from '@angular/router';
import { LayoutComponent } from './shared/components/layout/layout.component';
import { clientOnlyGuard } from './shared/guards/client-only.guard';

/**
 * Routes spécifiques au navigateur (client-only)
 * Ces routes utilisent des APIs incompatibles avec Node.js (Web Audio, __dirname, etc.)
 * et ne doivent être chargées que côté client
 */
export const browserOnlyRoutes: Routes = [
    {
        component: LayoutComponent,
        path: 'work',
        canMatch: [clientOnlyGuard],
        loadChildren: () => import('./desktop/desktop.module').then(m => m.DesktopModule),
        data: { breadcrumb: 'Practice' }
    },
    {
        // this component does not need a LayoutComponent !
        path: 'desktop',
        canMatch: [clientOnlyGuard],
        loadChildren: () => import('./desktop/desktop.module').then(m => m.DesktopModule),
        data: { breadcrumb: 'Desktop' }
    },
    {
        // Same workbench experience as `/desktop`, but with a shorter URL.
        // This route does not need a LayoutComponent.
        path: 'workbench',
        canMatch: [clientOnlyGuard],
        loadChildren: () => import('./desktop/desktop.module').then(m => m.DesktopModule),
        data: { breadcrumb: 'Workbench' }
    }
];
