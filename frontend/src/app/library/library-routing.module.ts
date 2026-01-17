import { NgModule } from '@angular/core';
import { RouterModule, type Routes } from '@angular/router';
import { BrowseComponent } from './components/browse/browse.component';

export const libraryRouteList: Routes = [
  {
    path: '',
    component: BrowseComponent,
    data: { breadcrumb: 'Browse' }
  },
  {
    path: 'genres',
    component: BrowseComponent,
    data: { breadcrumb: 'Browse' }
  },
  {
    path: 'genres/:genreSlug',
    component: BrowseComponent,
    data: { breadcrumb: 'Browse' }
  },
  {
    path: 'artists',
    component: BrowseComponent,
    data: { breadcrumb: 'Browse' }
  },
  {
    path: 'popular',
    component: BrowseComponent,
    data: { breadcrumb: 'Browse' }
  },  
  {
    path: 'artists/:artistSlug',
    component: BrowseComponent,
    data: { breadcrumb: 'Browse' }
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
