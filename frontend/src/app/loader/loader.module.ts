import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule } from '@angular/forms';
import { LoaderRoutingModule } from './loader-routing.module';
import { BrowseComponent } from './components/browse/browse.component';
import { ScoreInfoComponent } from './components/score-info/score-info.component';
import { GenreBrowseComponent } from './components/genre-browse/genre-browse.component';
import { ArtistBrowseComponent } from './components/artist-browse/artist-browse.component';


@NgModule({
  declarations: [],
  imports: [
    CommonModule,
    ReactiveFormsModule,
    LoaderRoutingModule,
    BrowseComponent,
    ScoreInfoComponent,
    GenreBrowseComponent,
    ArtistBrowseComponent
  ]
})
export class LoaderModule { }
