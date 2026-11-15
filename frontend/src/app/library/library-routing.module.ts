import { NgModule } from '@angular/core';
import { RouterModule, type Routes } from '@angular/router';
import { NAV } from '../shared/i18n/app-messages';
import { BrowseComponent } from './components/browse/browse.component';

export const libraryRouteList: Routes = [
  {
    path: '',
    component: BrowseComponent,
    data: { breadcrumb: NAV.browse }
  },
  {
    path: 'genres',
    component: BrowseComponent,
    data: { breadcrumb: NAV.browse }
  },
  {
    path: 'new',
    component: BrowseComponent,
    data: { breadcrumb: NAV.browse }
  },
  {
    path: 'genres/:genreSlug',
    component: BrowseComponent,
    data: { breadcrumb: NAV.browse }
  },
  {
    path: 'artists',
    component: BrowseComponent,
    data: { breadcrumb: NAV.browse }
  },
  {
    path: 'popular',
    component: BrowseComponent,
    data: { breadcrumb: NAV.browse }
  },  
  {
    path: 'artists/:artistSlug',
    component: BrowseComponent,
    data: { breadcrumb: NAV.browse }
  },
  {
    path: ':slug/info',
    redirectTo: '/score/:slug',
    pathMatch: 'full'
  }
];

@NgModule({
  imports: [RouterModule.forChild(libraryRouteList)],
  exports: [RouterModule]
})
export class LibraryRoutingModule { }
