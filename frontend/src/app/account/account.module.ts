import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

import { AccountRoutingModule } from './account-routing.module';
import { AccountScoresComponent } from './components/account-scores/account-scores.component';


@NgModule({
  declarations: [],
  imports: [
    CommonModule,
    AccountRoutingModule,
    AccountScoresComponent
  ]
})
export class AccountModule { }
