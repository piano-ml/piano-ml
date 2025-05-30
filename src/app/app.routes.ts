import type { Routes } from '@angular/router';
import { LayoutComponent } from './shared/components/layout/layout.component';

export const routes: Routes = [
    {
        component: LayoutComponent,
        path: '',
        loadChildren: () => import('./home/home.module').then(m => m.HomeModule),
        data: { breadcrumb: 'Home' }
    },
    {
        path: 'desktop',
        loadComponent: () => import('./desktop/components/desktop/desktop.component').then(m => m.DesktopComponent),
        data: { breadcrumb: 'Desktop' }
    },
    {
        component: LayoutComponent,
        path: 'open',
        loadChildren: () => import('./loader/loader.module').then(m => m.LoaderModule),
        data: { breadcrumb: 'Practice' }
    },
    {
        component: LayoutComponent,
        path: 'exercises',
        loadChildren: () => import('./exercises/exercises.module').then(m => m.ExercisesModule),
        data: { breadcrumb: 'Exercises' }

    },
    {
        path: '**',
        redirectTo: ''
    }
];
