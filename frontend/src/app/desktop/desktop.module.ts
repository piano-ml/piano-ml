import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

import { DesktopRoutingModule } from './desktop-routing.module';
import { WorkbenchComponent } from './components/workbench/workbench.component';
import { OsmdComponent } from './components/osmd/osmd.component';

@NgModule({
  declarations: [],
  imports: [
    CommonModule,
    DesktopRoutingModule,
    WorkbenchComponent,
    OsmdComponent
  ]
})
export class DesktopModule { }
