import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { LoginComponent } from './components/login/login.component';
import { AccountHomeComponent } from './components/home/home.component';
import { CreateAccountComponent } from './components/create-account/create-account.component';
import { ForgotPasswordComponent } from './components/password/forgot-password.component';
import { ResetPasswordComponent } from './components/password/reset-password.component';
import { AccountScoresComponent } from './components/account-scores/account-scores.component';
import { EditScoreComponent } from './components/edit-score/edit-score.component';
import { AccountPlaylistsComponent } from './components/playlists/account-playlists.component';
import { PlaylistDetailComponent } from './components/playlists/playlist-detail.component';

const routes: Routes = [
    { path: 'home', component: AccountHomeComponent,     data: { breadcrumb: $localize`:@@account.route.home:Home` } },
  { path: 'login', component: LoginComponent,     data: { breadcrumb: $localize`:@@account.route.login:Login` } },
  { path: 'create', component: CreateAccountComponent,     data: { breadcrumb: $localize`:@@account.route.create:Create` } },
  { path: 'forgot-password', component: ForgotPasswordComponent, data: { breadcrumb: $localize`:@@account.route.forgotPassword:Forgot password` } },
  { path: 'reset-password', component: ResetPasswordComponent, data: { breadcrumb: $localize`:@@account.route.resetPassword:New password` } },
  { path: 'scores', component: AccountScoresComponent,     data: { breadcrumb: $localize`:@@account.route.scores:My Scores` } },
  {
    path: 'playlists',
    data: { breadcrumb: $localize`:@@account.route.playlists:My Playlists` },
    children: [
      { path: '', component: AccountPlaylistsComponent },
      { path: ':slug', component: PlaylistDetailComponent, data: { breadcrumb: $localize`:@@account.route.playlist:Playlist` } },
    ],
  },
  { path: 'score/edit/:id', component: EditScoreComponent,     data: { breadcrumb: $localize`:@@account.route.editScore:Edit Score` } },
  { path: '', redirectTo: 'home', pathMatch: 'full' }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class AccountRoutingModule { }
