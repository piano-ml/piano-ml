import { NgModule } from '@angular/core';
import { RouterModule, type Routes } from '@angular/router';
import { AgilityComponent } from './agility/agility.component';
import { Scale } from 'tone';
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
    data: { breadcrumb: 'Agility' }
  },
  {
    path: 'scale',
    component: ScalesComponent,
    data: { breadcrumb: 'Scales' }
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class ExercisesRoutingModule { }

