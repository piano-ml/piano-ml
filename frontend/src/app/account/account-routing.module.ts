import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { LoginComponent } from './components/login/login.component';
import { AccountHomeComponent } from './components/home/home.component';
import { CreateAccountComponent } from './components/create-account/create-account.component';

const routes: Routes = [
    { path: 'home', component: AccountHomeComponent,     data: { breadcrumb: 'Home' } },
  { path: 'login', component: LoginComponent,     data: { breadcrumb: 'Login' } },
  { path: 'create', component: CreateAccountComponent,     data: { breadcrumb: 'Create' } },
  { path: '', redirectTo: 'login', pathMatch: 'full' }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class AccountRoutingModule { }
