import { Injectable, PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Router } from '@angular/router';
import { Observable, tap } from 'rxjs';
import { AccountCreatePostRequest, AccountLoginPostRequest, AccountService, UserApiInfo } from '../../core/api';
import { SessionStorageService } from './session-storage.service';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private platformId = inject(PLATFORM_ID);
  private isBrowser: boolean;

  constructor(
    private accountService: AccountService,
    private router: Router,
    private sessionStorage: SessionStorageService
  ) {
    this.isBrowser = isPlatformBrowser(this.platformId);
    if (this.isBrowser) {
      this.refreshSessionFromServer();
    }
  }

  get isLoggedIn(): Observable<boolean> {
    return this.sessionStorage.isLoggedIn;
  }

  getUserId(): string | null {
    return this.sessionStorage.getUserId();
  }

  isAdmin(): boolean {
    return this.sessionStorage.isAdmin();
  }


  login(user: AccountLoginPostRequest) {
    return this.accountService.accountLoginPost(user).pipe(
      tap(response => {
        this.sessionStorage.persistSessionData({
          userId: response.userId ?? null,
          username: response.username ?? null,
          roles: response.roles ?? null          
        });
        this.router.navigate(['/']);
        if (this.isBrowser) {
          this.refreshSessionFromServer();
        }
      })
    );
  }

  logout(): void {
    console.info('Logging out user');
    this.accountService.accountLogoutGet().subscribe({
      next: () => this.clearSession(true),
      error: () => this.clearSession(true)
    });
  }

  register(user: AccountCreatePostRequest) {
    return this.accountService.accountCreatePost(user);
  }
  
  getUserInfo() {
    return this.accountService.accountUserinfoGet();
  }
  
  updateUserInfo(data: any) {
    return this.accountService.accountUserinfoPut(data);
  }

  handleUnauthorized(): void {
    console.info('Unauthorized access detected, clearing session');
    this.clearSession(true);
  }

  private refreshSessionFromServer(): void {
    if (!this.isBrowser || this.sessionStorage.getUserId() === null) {
      return;
    }
    
    this.accountService.accountUserinfoGet().subscribe({
      next: (userInfo: UserApiInfo) => {
        this.sessionStorage.persistSessionData({
          userId: userInfo.id ?? null,
          username: userInfo.name ?? null
        });
      },
      error: error => {
        console.log('Failed to refresh session from server:', error);
        if (error?.status === 401 || error?.status === 403) {
          this.clearSession(false);
        }
      }
    });
  }

  private clearSession(redirect: boolean): void {
    this.sessionStorage.clearSession();
    
    if (redirect && this.isBrowser) {
      const target = '/account/login';
      if (this.router.url !== target) {
        this.router.navigate([target]);
      }
    }
  }
}
