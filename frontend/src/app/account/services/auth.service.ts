import { Injectable, PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Router } from '@angular/router';
import { BehaviorSubject, Observable, tap } from 'rxjs';
import { AccountCreatePostRequest, AccountLoginPostRequest, AccountService, UserApiInfo } from '../../core/api';

interface SessionLike {
  userId?: string | null;
  username?: string | null;
}

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private loggedIn = new BehaviorSubject<boolean>(this.hasStoredSession());
  private platformId = inject(PLATFORM_ID);
  private isBrowser: boolean;

  constructor(
    private accountService: AccountService,
    private router: Router
  ) {
    this.isBrowser = isPlatformBrowser(this.platformId);
    if (this.isBrowser) {
      this.refreshSessionFromServer();
    }
  }

  get isLoggedIn(): Observable<boolean> {
    return this.loggedIn.asObservable();
  }

  getUserId(): string | null {
    if (!this.isBrowser) {
      return null;
    }
    return localStorage.getItem('userId');
  }

  login(user: AccountLoginPostRequest) {
    return this.accountService.accountLoginPost(user).pipe(
      tap(response => {
        this.persistSessionData({
          userId: response.userId ?? null,
          username: response.username ?? null
        });
        this.loggedIn.next(true);
        this.router.navigate(['/']);
        if (this.isBrowser) {
          this.refreshSessionFromServer();
        }
      })
    );
  }

  logout(): void {
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
    this.clearSession(true);
  }

  private hasStoredSession(): boolean {
    if (!this.isBrowser) {
      return false;
    }
    return !!localStorage.getItem('userId');
  }

  private refreshSessionFromServer(): void {
    if (!this.isBrowser) {
      return;
    }
    
    this.accountService.accountUserinfoGet().subscribe({
      next: (userInfo: UserApiInfo) => {
        this.persistSessionData({
          userId: userInfo.id ?? null,
          username: userInfo.name ?? null
        });
        this.loggedIn.next(true);
      },
      error: error => {
        if (error?.status === 401 || error?.status === 403) {
          this.clearSession(false);
        }
      }
    });
  }

  private persistSessionData(session: SessionLike): void {
    if (!this.isBrowser) {
      return;
    }
    
    if ('userId' in session) {
      if (session.userId) {
        localStorage.setItem('userId', session.userId);
      } else {
        localStorage.removeItem('userId');
      }
    }
    if ('username' in session) {
      if (session.username) {
        localStorage.setItem('username', session.username);
      } else {
        localStorage.removeItem('username');
      }
    }
  }

  private clearSession(redirect: boolean): void {
    if (this.isBrowser) {
      localStorage.removeItem('userId');
      localStorage.removeItem('username');
    }
    
    if (this.loggedIn.value) {
      this.loggedIn.next(false);
    }
    
    if (redirect && this.isBrowser) {
      const target = '/account/login';
      if (this.router.url !== target) {
        this.router.navigate([target]);
      }
    }
  }
}
