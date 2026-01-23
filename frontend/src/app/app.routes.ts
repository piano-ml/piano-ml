import type { Routes } from '@angular/router';
import { LayoutComponent } from './shared/components/layout/layout.component';

export const routes: Routes = [
    {
        component: LayoutComponent,
        path: 'score',
        data: { breadcrumb: 'Score' },
        children: [
            {
                path: ':slug',
                loadComponent: () => import('./library/components/score-info/score-info.component').then(m => m.ScoreInfoComponent)
            }
        ]
    },
    {
        component: LayoutComponent,
        path: '',
        loadChildren: () => import('./home/home.module').then(m => m.HomeModule),
        data: { breadcrumb: 'Home' }
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
        data: { breadcrumb: 'Practice' }
    },
    {
        component: LayoutComponent,
        path: 'exercises',
        loadChildren: () => import('./exercises/exercises.module').then(m => m.ExercisesModule),
        data: { breadcrumb: 'Exercises' }

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
