import { NgModule } from '@angular/core';
import { RouterModule, type Routes } from '@angular/router';
import { AgilityComponent } from './agility/agility.component';
import { ScalesComponent } from './scales/scales.component';
import { HomeComponent } from './home/home.component';

const routes: Routes = [
  {
    path: '',
    component: HomeComponent,
    data: {
      seo: {
        title: $localize`:@@seo.exercises.title:Piano Exercises: Scales, Arpeggios & Agility`,
        description: $localize`:@@seo.exercises.description:Practice piano scales, arpeggios and agility exercises around the circle of fifths, with hands-separated practice, adjustable tempo and MIDI feedback.`
      }
    }
  },
  {
    path: 'agility',
    component: AgilityComponent,
    pathMatch: 'full',
    data: { breadcrumb: $localize`:@@exercisesInKey.agility:Agility` }
  },
  {
    path: 'agility/:selectedKey/:chordKey/:exerciseKey',
    component: AgilityComponent,
    data: { breadcrumb: $localize`:@@exercisesInKey.agility:Agility` }
  },
  {
    path: 'scale',
    component: ScalesComponent,
    pathMatch: 'full',
    data: { breadcrumb: $localize`:@@exercisesInKey.scales:Scales` }
  },
  {
    path: 'scale/:selectedKey/:scaleKey/:exerciseKey',
    component: ScalesComponent,
    data: { breadcrumb: $localize`:@@exercisesInKey.scales:Scales` }
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class ExercisesRoutingModule { }

