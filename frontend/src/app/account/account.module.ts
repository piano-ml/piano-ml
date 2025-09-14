import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

import { AccountRoutingModule } from './account-routing.module';
import { AccountScoresComponent } from './components/account-scores/account-scores.component';
import { EditScoreComponent } from './components/edit-score/edit-score.component';


@NgModule({
  declarations: [],
  imports: [
    CommonModule,
    AccountRoutingModule,
    AccountScoresComponent,
    EditScoreComponent
  ]
})
export class AccountModule { }
