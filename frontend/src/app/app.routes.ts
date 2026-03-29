import type { Routes } from '@angular/router';
import { LayoutComponent } from './shared/components/layout/layout.component';

export const routes: Routes = [
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
    },
    {
        component: LayoutComponent,
        path: 'score',
        data: { breadcrumb: 'Score' },
        children: [
            {
                path: ':slug',
                loadComponent: () => import('./library/components/score-info/score-info.component').then(m => m.ScoreInfoComponent),
                resolve: {
                    score: () => import('./library/resolvers/score-info.resolver').then(m => m.scoreInfoResolver)
                }
            }
        ]
    },
    {
        component: LayoutComponent,
        path: 'account',
        loadChildren: () => import('./account/account.module').then(m => m.AccountModule),
        data: { breadcrumb: 'Account' }
    },
    {
        component: LayoutComponent,
        path: 'blog',
        loadChildren: () => import('./blog/blog.module').then(m => m.BlogModule),
        data: { breadcrumb: 'Blog' }

    },
    {
        component: LayoutComponent,
        path: 'import',
        loadChildren: () => import('./import/import.module').then(m => m.ImportModule),
        data: { breadcrumb: 'Import' }
    },
    {
        path: 'library',
        component: LayoutComponent,
        loadChildren: () => import('./library/library.module').then(m => m.LibraryModule),
        data: { breadcrumb: 'Library' }
    },
    {
        component: LayoutComponent,
        path: 'exercises',
        loadChildren: () => import('./exercises/exercises.module').then(m => m.ExercisesModule),
        data: { breadcrumb: 'Exercises' }

    },
    {
        component: LayoutComponent,
        path: '',
        loadChildren: () => import('./home/home.module').then(m => m.HomeModule),
        data: { breadcrumb: 'Home' }
    },
    {
        path: 'error',
        loadComponent: () => import('./shared/components/error/error.component').then(m => m.ErrorComponent),
        data: { breadcrumb: 'Erreur' }
    },
    {
        path: '**',
        redirectTo: ''
    }
];
