import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { LoginComponent } from './components/login/login.component';
import { AccountHomeComponent } from './components/home/home.component';
import { CreateAccountComponent } from './components/create-account/create-account.component';
import { AccountScoresComponent } from './components/account-scores/account-scores.component';
import { EditScoreComponent } from './components/edit-score/edit-score.component';

const routes: Routes = [
    { path: 'home', component: AccountHomeComponent,     data: { breadcrumb: 'Home' } },
  { path: 'login', component: LoginComponent,     data: { breadcrumb: 'Login' } },
  { path: 'create', component: CreateAccountComponent,     data: { breadcrumb: 'Create' } },
  { path: 'scores', component: AccountScoresComponent,     data: { breadcrumb: 'My Scores' } },
  { path: 'score/edit/:id', component: EditScoreComponent,     data: { breadcrumb: 'Edit Score' } },
  { path: '', redirectTo: 'login', pathMatch: 'full' }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class AccountRoutingModule { }
