import type { Routes } from '@angular/router';
import { LayoutComponent } from './shared/components/layout/layout.component';

export const routes: Routes = [
    {
        component: LayoutComponent,
        path: '',
        loadChildren: () => import('./home/home.module').then(m => m.HomeModule),
        data: { breadcrumb: 'Home' }
    },
    // {
    //     path: 'account/home',
    //     loadComponent: () => import('./account/components/home/home.component').then(m => m.AccountHomeComponent),
    //     data: { breadcrumb: 'Account Home' }
    // },
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
        component: LayoutComponent,
        path: 'blog',
        loadChildren: () => import('./blog/blog.module').then(m => m.BlogModule),
        data: { breadcrumb: 'Blog' }

    },
    {
        component: LayoutComponent,
        path: 'account',
        loadChildren: () => import('./account/account.module').then(m => m.AccountModule),
        data: { breadcrumb: 'Account' }
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
