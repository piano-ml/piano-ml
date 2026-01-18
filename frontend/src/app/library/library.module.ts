import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule } from '@angular/forms';
import { LibraryRoutingModule } from './library-routing.module';
import { BrowseComponent } from './components/browse/browse.component';


@NgModule({
  declarations: [],
  imports: [
    CommonModule,
    ReactiveFormsModule,
    LibraryRoutingModule,
    BrowseComponent,
  ]
})
export class LibraryModule { }
