import { NgModule } from '@angular/core';
import { RouterModule, type Routes } from '@angular/router';
import { BrowseComponent } from './components/browse/browse.component';
import { ScoreInfoComponent } from './components/score-info/score-info.component';

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
    path: ':id/info',
    component: ScoreInfoComponent,
    data: { breadcrumb: 'Score Info' }
  }
];

@NgModule({
  imports: [RouterModule.forChild(libraryRouteList)],
  exports: [RouterModule]
})
export class LibraryRoutingModule { }
