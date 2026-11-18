import type { Routes } from '@angular/router';
import { LayoutComponent } from './shared/components/layout/layout.component';
import { NAV } from './shared/i18n/app-messages';
import { ROUTE_LABELS } from './shared/i18n/route-labels';
import type { SeoData } from './shared/seo';
import { adminGuard } from './admin/admin.guard';

/** Mirrors the Disallow rules in robots.txt for routes rendered in-app. */
const NOINDEX_SEO: SeoData = { noindex: true };

export const routes: Routes = [
    {
        path: 'work',
        loadChildren: () => import('./desktop/desktop.module').then(m => m.DesktopModule),
        data: { breadcrumb: ROUTE_LABELS.practice, seo: NOINDEX_SEO }
    },
    {
        path: 'desktop',
        loadChildren: () => import('./desktop/desktop.module').then(m => m.DesktopModule),
        data: { breadcrumb: ROUTE_LABELS.desktop, seo: NOINDEX_SEO }
    },
    {
        path: 'workbench',
        loadChildren: () => import('./desktop/desktop.module').then(m => m.DesktopModule),
        data: { breadcrumb: ROUTE_LABELS.workbench, seo: NOINDEX_SEO }
    },
    {
        component: LayoutComponent,
        path: 'score',
        // No breadcrumb here: /score is not a page, so a trail ending on it
        // would link to a 404. The score itself names the crumb.
        children: [
            {
                path: ':slug',
                loadComponent: () => import('./library/components/score-info/score-info.component').then(m => m.ScoreInfoComponent),
                data: { breadcrumb: ROUTE_LABELS.score }
            },
            {
                // Owners and admins pick the study tracks of a MIDI score again (the page says so to anyone else)
                path: ':slug/reimport',
                loadComponent: () => import('./library/components/score-reimport/score-reimport.component').then(m => m.ScoreReimportComponent),
                data: { breadcrumb: ROUTE_LABELS.reimport, seo: NOINDEX_SEO }
            }
        ]
    },
    {
        component: LayoutComponent,
        path: 'account',
        loadChildren: () => import('./account/account.module').then(m => m.AccountModule),
        data: { breadcrumb: ROUTE_LABELS.account, seo: NOINDEX_SEO }
    },
    {
        component: LayoutComponent,
        path: 'blog',
        loadChildren: () => import('./blog/blog.module').then(m => m.BlogModule),
        data: { breadcrumb: ROUTE_LABELS.blog }

    },
    {
        component: LayoutComponent,
        path: 'import',
        loadChildren: () => import('./import/import.module').then(m => m.ImportModule),
        data: { breadcrumb: ROUTE_LABELS.import, seo: NOINDEX_SEO }
    },
    {
        path: 'library',
        component: LayoutComponent,
        loadChildren: () => import('./library/library.module').then(m => m.LibraryModule),
        data: { breadcrumb: ROUTE_LABELS.library }
    },
    {
        component: LayoutComponent,
        path: 'exercises',
        loadChildren: () => import('./exercises/exercises.module').then(m => m.ExercisesModule),
        data: { breadcrumb: NAV.exercises }

    },
    {
        // Connect an external AI assistant (coach, issue #414): logged-in users only, no SEO value
        component: LayoutComponent,
        path: 'coach',
        children: [
            {
                path: 'connect',
                loadComponent: () => import('./coach/connect/connect.component').then(m => m.ConnectComponent),
                data: { breadcrumb: ROUTE_LABELS.coachConnect, seo: NOINDEX_SEO }
            },
            {
                // Consent page of the coach OAuth server: an application sent the user here to ask for access
                path: 'authorize',
                loadComponent: () => import('./coach/authorize/authorize.component').then(m => m.AuthorizeComponent),
                data: { breadcrumb: ROUTE_LABELS.coachAuthorize, seo: NOINDEX_SEO }
            }
        ]
    },
    {
        // Admins only (issue #410): adminGuard is UX, the backend refuses /admin/** to anyone else
        component: LayoutComponent,
        path: 'admin',
        canActivate: [adminGuard],
        canActivateChild: [adminGuard],
        loadChildren: () => import('./admin/admin.routes').then(m => m.ADMIN_ROUTES),
        data: { breadcrumb: ROUTE_LABELS.admin, seo: NOINDEX_SEO }
    },
    {
        component: LayoutComponent,
        path: '',
        loadChildren: () => import('./home/home.module').then(m => m.HomeModule),
        data: { breadcrumb: NAV.home }
    },
    {
        path: 'error',
        loadComponent: () => import('./shared/components/error/error.component').then(m => m.ErrorComponent),
        data: { breadcrumb: ROUTE_LABELS.error, seo: { title: $localize`:@@route.error.title:Page Error`, ...NOINDEX_SEO } }
    },
    {
        // Unknown URLs used to redirect to the homepage, which search engines
        // read as a soft 404. Answer in place, with a real 404 and noindex.
        path: '**',
        loadComponent: () => import('./shared/components/error/error.component').then(m => m.ErrorComponent),
        data: { breadcrumb: ROUTE_LABELS.notFound, status: 404, seo: { title: $localize`:@@route.notFound.title:Page Not Found`, ...NOINDEX_SEO } }
    }
];
