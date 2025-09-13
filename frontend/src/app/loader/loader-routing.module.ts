import { NgModule } from '@angular/core';
import { RouterModule, type Routes } from '@angular/router';
import { LoaderHomeComponent } from './components/loader-home/loader-home.component';
import { LinkComponent } from './components/link/link.component';
import { ImportWorkComponent } from './components/import-work/import-work.component';
import { BrowseComponent } from './components/browse/browse.component';
import { ScoreInfoComponent } from './components/score-info/score-info.component';

export const loaderRouteList: Routes = [
  {
    path: '',
    component: BrowseComponent,
    data: { breadcrumb: 'Browse' }
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
    component: ScoreInfoComponent
  }

];

@NgModule({
  imports: [RouterModule.forChild(loaderRouteList)],
  exports: [RouterModule]
})
export class LoaderRoutingModule { }
