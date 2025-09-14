import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule } from '@angular/forms';
import { LoaderRoutingModule } from './loader-routing.module';
import { BrowseComponent } from './components/browse/browse.component';
import { ScoreInfoComponent } from './components/score-info/score-info.component';


@NgModule({
  declarations: [],
  imports: [
    CommonModule,
    ReactiveFormsModule,
    LoaderRoutingModule,
    BrowseComponent,
    ScoreInfoComponent
  ]
})
export class LoaderModule { }
