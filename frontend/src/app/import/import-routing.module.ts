import { NgModule } from '@angular/core';
import { RouterModule, type Routes } from '@angular/router';
import { LinkComponent } from './components/link/link.component';
import { ImportWorkComponent } from './components/import-work/import-work.component';

export const importRouteList: Routes = [
  {
    path: 'link',
    component: LinkComponent
  },
  {
    path: 'import-work/:mbid',
    component: ImportWorkComponent
  }
];

@NgModule({
  imports: [RouterModule.forChild(importRouteList)],
  exports: [RouterModule]
})
export class ImportRoutingModule { }
