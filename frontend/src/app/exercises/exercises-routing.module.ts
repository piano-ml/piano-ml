import { NgModule } from '@angular/core';
import { RouterModule, type Routes } from '@angular/router';
import { AgilityComponent } from './agility/agility.component';
import { ScalesComponent } from './scales/scales.component';
import { HomeComponent } from './home/home.component';

const routes: Routes = [
  {
    path: '',
    component: HomeComponent
},
  {
    path: 'agility',
    component: AgilityComponent,
    pathMatch: 'full',
    data: { breadcrumb: 'Agility' }
  },
  {
    path: 'agility/:selectedKey/:chordKey/:exerciseKey',
    component: AgilityComponent,
    data: { breadcrumb: 'Agility' }
  },
  {
    path: 'scale',
    component: ScalesComponent,
    pathMatch: 'full',
    data: { breadcrumb: 'Scales' }
  },
  {
    path: 'scale/:scaleKey/:selectedKey/:exerciseKey',
    component: ScalesComponent,
    data: { breadcrumb: 'Scales' }
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class ExercisesRoutingModule { }

