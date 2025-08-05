import { NgModule } from '@angular/core';
import { RouterModule, type Routes } from '@angular/router';
import { LoaderHomeComponent } from './components/loader-home/loader-home.component';

export const loaderRouteList: Routes = [
  {
    path: '',
    component: LoaderHomeComponent
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
