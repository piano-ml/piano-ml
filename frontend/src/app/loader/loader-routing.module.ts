import { NgModule } from '@angular/core';
import { RouterModule, type Routes } from '@angular/router';
import { BrowseComponent } from './components/browse/browse.component';
import { LinkComponent } from './components/link/link.component';
import { ImportWorkComponent } from './components/import-work/import-work.component';
import { GenreBrowseComponent } from './components/genre-browse/genre-browse.component';
import { ArtistBrowseComponent } from './components/artist-browse/artist-browse.component';
import { ScoreInfoComponent } from './components/score-info/score-info.component';
import { SlugToWorkbenchComponent } from './components/slug-to-workbench/slug-to-workbench.component';

export const loaderRouteList: Routes = [
  {
    path: '',
    component: BrowseComponent,
    children: [
      { path: '', redirectTo: 'genres', pathMatch: 'full' },
      { path: 'genres', component: GenreBrowseComponent, data: { breadcrumb: 'Genres' } },
      { path: 'artists', component: ArtistBrowseComponent, data: { breadcrumb: 'Artists' } }
    ]
  },
  {
    path: ':id/info',
    component: ScoreInfoComponent,
    data: { breadcrumb: 'Score Info' }
  },
  {
    path: 'link',
    component: LinkComponent
  },
  {
    path: 'import-work/:mbid',
    component: ImportWorkComponent
  },
  {
    path: ':slug',
    component: SlugToWorkbenchComponent
  }
];

@NgModule({
  imports: [RouterModule.forChild(loaderRouteList)],
  exports: [RouterModule]
})
export class LoaderRoutingModule { }
