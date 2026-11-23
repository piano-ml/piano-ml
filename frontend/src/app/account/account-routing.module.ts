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
import { ACCOUNT_TABS, accountTabLabel } from './components/home/account-tabs';

const routes: Routes = [
  { path: 'login', component: LoginComponent,     data: { breadcrumb: $localize`:@@account.route.login:Login` } },
  { path: 'create', component: CreateAccountComponent,     data: { breadcrumb: $localize`:@@account.route.create:Create` } },
  { path: 'forgot-password', component: ForgotPasswordComponent, data: { breadcrumb: $localize`:@@account.route.forgotPassword:Forgot password` } },
  { path: 'reset-password', component: ResetPasswordComponent, data: { breadcrumb: $localize`:@@account.route.resetPassword:New password` } },
  { path: 'score/edit/:id', component: EditScoreComponent,     data: { breadcrumb: $localize`:@@account.route.editScore:Edit Score` } },
  // A playlist's own page, outside the tabs: Account > My Playlists > <playlist>
  {
    path: 'playlists',
    data: { breadcrumb: accountTabLabel('playlists') },
    children: [
      { path: ':slug', component: PlaylistDetailComponent, data: { breadcrumb: $localize`:@@account.route.playlist:Playlist` } },
    ],
  },
  // Former URLs of the tabs
  { path: 'home', redirectTo: ACCOUNT_TABS[0].path, pathMatch: 'full' },
  { path: 'home/:tab', redirectTo: ':tab' },
  {
    // The account page: one tab per child route (/account/playlists, /account/scores…); the breadcrumb shows the open tab
    path: '',
    component: AccountHomeComponent,
    children: [
      { path: '', redirectTo: ACCOUNT_TABS[0].path, pathMatch: 'full' },
      { path: 'playlists', component: AccountPlaylistsComponent, data: { breadcrumb: accountTabLabel('playlists') } },
      { path: 'scores', component: AccountScoresComponent, data: { breadcrumb: accountTabLabel('scores') } },
      { path: 'practice', component: PracticeSummaryComponent, data: { breadcrumb: accountTabLabel('practice') } },
      { path: 'ai', component: CoachGrantsComponent, data: { breadcrumb: accountTabLabel('ai') } },
      { path: 'me', component: AccountMeComponent, data: { breadcrumb: accountTabLabel('me') } },
    ],
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class AccountRoutingModule { }
