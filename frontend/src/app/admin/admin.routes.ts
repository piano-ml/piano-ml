import type { Routes } from '@angular/router';

/** Admin pages, behind adminGuard in app.routes.ts (issue #410). */
export const ADMIN_ROUTES: Routes = [
  {
    path: 'errors',
    data: { breadcrumb: $localize`:@@admin.route.errors:Error reports` },
    children: [
      {
        path: '',
        loadComponent: () => import('./error-reports/error-reports.component').then(m => m.ErrorReportsComponent),
      },
      {
        path: ':id',
        loadComponent: () => import('./error-reports/error-report-detail.component').then(m => m.ErrorReportDetailComponent),
        data: { breadcrumb: $localize`:@@admin.route.errorReport:Report` },
      },
    ],
  },
  { path: '', redirectTo: 'errors', pathMatch: 'full' },
];
