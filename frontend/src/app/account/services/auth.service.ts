import { Injectable, PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Router } from '@angular/router';
import { Observable, tap } from 'rxjs';
import { AccountCreatePostRequest, AccountLoginPostRequest, AccountService, UserApiInfo } from '../../core/api';
import { SessionStorageService } from './session-storage.service';
import { LOGIN_PATH, loginQueryParams } from './return-url';

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
        // No navigation here: the login page decides where to go (back to the returnUrl)
        if (this.isBrowser) {
          this.refreshSessionFromServer();
        }
      })
    );
  }

  logout(): void {
    console.info('Logging out user');
    this.accountService.accountLogoutPost().subscribe({
      next: () => this.clearSession(true, false),
      error: () => this.clearSession(true, false)
    });
  }

  /**
   * Deletes the logged-in user's account. The backend moves the user's scores to the "junk" system user and
   * expires the auth cookie; callers then log out.
   */
  deleteAccount(): Observable<void> {
    return this.accountService.accountDeletePost();
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
        if (error?.status === 401) {
          this.clearSession(false);
        }
      }
    });
  }

  /** `rememberPage`: after an expired session, login brings the user back; after a logout it doesn't. */
  private clearSession(redirect: boolean, rememberPage = true): void {
    this.sessionStorage.clearSession();
    
    if (redirect && this.isBrowser) {
      if (!this.router.url.startsWith(LOGIN_PATH)) {
        if (rememberPage) {
          this.router.navigate([LOGIN_PATH], { queryParams: loginQueryParams(this.router.url) });
        } else {
          this.router.navigate([LOGIN_PATH]);
        }
      }
    }
  }
}
