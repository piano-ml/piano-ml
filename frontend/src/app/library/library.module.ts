import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule } from '@angular/forms';
import { LibraryRoutingModule } from './library-routing.module';
import { BrowseComponent } from './components/browse/browse.component';
import { ScoreInfoComponent } from './components/score-info/score-info.component';


@NgModule({
  declarations: [],
  imports: [
    CommonModule,
    ReactiveFormsModule,
    LibraryRoutingModule,
    BrowseComponent,
    ScoreInfoComponent
  ]
})
export class LibraryModule { }
