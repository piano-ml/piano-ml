import { Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, tap } from 'rxjs';
import { AccountCreatePostRequest, AccountLoginPostRequest, AccountService, UserApiInfo } from '../../core/api';
import { AuthSessionService } from './auth-session.service';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  constructor(
    private accountService: AccountService,
    private router: Router,
    private sessionService: AuthSessionService
  ) {
    if (this.sessionService.isBrowser) {
      this.refreshSessionFromServer();
    }
  }

  get isLoggedIn(): Observable<boolean> {
    return this.sessionService.isLoggedIn$;
  }

  getUserId(): string | null {
    return this.sessionService.getUserId();
  }

  isAdmin(): boolean {
    return this.sessionService.isAdmin();
  }


  login(user: AccountLoginPostRequest) {
    return this.accountService.accountLoginPost(user).pipe(
      tap(response => {
        this.sessionService.persistSessionData({
          userId: response.userId ?? null,
          username: response.username ?? null,
          roles: response.roles ?? null          
        });
        this.sessionService.setLoggedIn(true);
        this.router.navigate(['/']);
        if (this.sessionService.isBrowser) {
          this.refreshSessionFromServer();
        }
      })
    );
  }

  logout(): void {
    console.info('Logging out user');
    this.accountService.accountLogoutGet().subscribe({
      next: () => this.sessionService.clearSession(true),
      error: () => this.sessionService.clearSession(true)
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
    this.sessionService.handleUnauthorized();
  }

  private refreshSessionFromServer(): void {
    if (!this.sessionService.isBrowser) {
      return;
    }
    
    this.accountService.accountUserinfoGet().subscribe({
      next: (userInfo: UserApiInfo) => {
        this.sessionService.persistSessionData({
          userId: userInfo.id ?? null,
          username: userInfo.name ?? null
        });
        this.sessionService.setLoggedIn(true);
      },
      error: error => {
        console.log('Failed to refresh session from server:', error);
        if (error?.status === 401 || error?.status === 403) {
          this.sessionService.clearSession(false);
        }
      }
    });
  }
}
