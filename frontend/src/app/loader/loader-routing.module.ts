import { NgModule } from '@angular/core';
import { RouterModule, type Routes } from '@angular/router';
import { LoaderHomeComponent } from './components/loader-home/loader-home.component';
import { LinkComponent } from './components/link/link.component';
import { ImportWorkComponent } from './components/import-work/import-work.component';

export const loaderRouteList: Routes = [
  {
    path: '',
    component: LoaderHomeComponent
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
    path: ':filename',
    component: LoaderHomeComponent
  }

];

@NgModule({
  imports: [RouterModule.forChild(loaderRouteList)],
  exports: [RouterModule]
})
export class LoaderRoutingModule { }
