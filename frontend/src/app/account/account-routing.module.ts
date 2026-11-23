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
import { AccountMeComponent } from './components/home/me/me.component';
import { PracticeSummaryComponent } from './components/practice-summary/practice-summary.component';
import { CoachGrantsComponent } from './components/coach-grants/coach-grants.component';

const routes: Routes = [
  {
    // The account page: one tab per child route
    path: 'home',
    component: AccountHomeComponent,
    data: { breadcrumb: $localize`:@@account.route.home:Home` },
    children: [
      { path: '', redirectTo: 'me', pathMatch: 'full' },
      { path: 'me', component: AccountMeComponent },
      { path: 'ai', component: CoachGrantsComponent },
      { path: 'practice', component: PracticeSummaryComponent },
      { path: 'scores', component: AccountScoresComponent },
      { path: 'playlists', component: AccountPlaylistsComponent },
    ],
  },
  { path: 'login', component: LoginComponent,     data: { breadcrumb: $localize`:@@account.route.login:Login` } },
  { path: 'create', component: CreateAccountComponent,     data: { breadcrumb: $localize`:@@account.route.create:Create` } },
  { path: 'forgot-password', component: ForgotPasswordComponent, data: { breadcrumb: $localize`:@@account.route.forgotPassword:Forgot password` } },
  { path: 'reset-password', component: ResetPasswordComponent, data: { breadcrumb: $localize`:@@account.route.resetPassword:New password` } },
  // Former pages, now tabs of the account page
  { path: 'scores', redirectTo: 'home/scores', pathMatch: 'full' },
  {
    path: 'playlists',
    data: { breadcrumb: $localize`:@@account.route.playlists:My Playlists` },
    children: [
      { path: '', redirectTo: '/account/home/playlists', pathMatch: 'full' },
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
