import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { RouterModule } from '@angular/router';
// biome-ignore lint/style/useImportType: <explanation>
import { BreadcrumbService } from '../../services/breadcrumb.service';
import { CommonModule } from '@angular/common';
import { NgIcon, provideIcons } from '@ng-icons/core';
//import { ShareButtons } from 'ngx-sharebuttons/buttons';
import {  bootstrapGithub } from '@ng-icons/bootstrap-icons';

import { map, Observable, tap } from 'rxjs';
import { AuthService } from '../../../account/services/auth.service';

@Component({
  selector: 'app-layout',
  imports: [RouterModule, CommonModule,   NgIcon],
  templateUrl: './layout.component.html',
  styleUrl: './layout.component.css',
    viewProviders: [provideIcons({ bootstrapGithub })],
})
export class LayoutComponent {  
  isLoggedIn$: Observable<boolean>;
  username$: Observable<string | null>;;
  shareLinks = ['facebook','x','reddit','viber','xing']
  
  constructor (
    public breadcrumbService: BreadcrumbService,
    private authService: AuthService,
    public router: Router
  ) {
    this.isLoggedIn$ = this.authService.isLoggedIn;
    this.username$ = this.authService.getUserInfo().pipe(
      tap(user => {
        if (user) {
          localStorage.setItem('username', user.name!);
        }
      }),
      map(user => user?.name || null)
    );
  }

  logout() {
    this.authService.logout();
  }
}
