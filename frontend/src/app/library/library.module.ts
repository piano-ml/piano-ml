import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule } from '@angular/forms';
import { LibraryRoutingModule } from './library-routing.module';



import { FormsModule } from '@angular/forms';
import { SharedModule } from '../shared/shared.module';
import { BrowseComponent } from './components/browse/browse.component';
import { BrowseByAuthorsComponent } from './components/browse-by-authors/browse-by-authors.component';
import { BrowseByGenreComponent } from './components/browse-by-genre/browse-by-genre.component';
import { ScoreTableComponent } from '../shared/components/score-table/score-table.component';

@NgModule({
  imports: [
    CommonModule,
    ReactiveFormsModule,
    FormsModule,
    LibraryRoutingModule,
    SharedModule,
    BrowseComponent,
    BrowseByAuthorsComponent,
    BrowseByGenreComponent,
    ScoreTableComponent
  ]
})
export class LibraryModule { }
