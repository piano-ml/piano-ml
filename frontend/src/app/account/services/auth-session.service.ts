import { isPlatformBrowser } from '@angular/common';
import { Injectable, PLATFORM_ID, inject } from '@angular/core';
import { Router } from '@angular/router';
import { BehaviorSubject, Observable } from 'rxjs';

interface SessionLike {
  userId?: string | null;
  username?: string | null;
  roles?: string | null;
}

@Injectable({
  providedIn: 'root'
})
export class AuthSessionService {
  private platformId = inject(PLATFORM_ID);
  readonly isBrowser = isPlatformBrowser(this.platformId);
  private loggedIn = new BehaviorSubject<boolean>(this.hasStoredSession());

  constructor(private router: Router) {}

  get isLoggedIn$(): Observable<boolean> {
    return this.loggedIn.asObservable();
  }

  setLoggedIn(value: boolean): void {
    if (this.loggedIn.value !== value) {
      this.loggedIn.next(value);
    }
  }

  getUserId(): string | null {
    if (!this.isBrowser) {
      return null;
    }
    return localStorage.getItem('userId');
  }

  isAdmin(): boolean {
    if (!this.isBrowser) {
      return false;
    }
    const roles = localStorage.getItem('roles');
    return roles?.split(',').map(s => s.trim()).includes('ADMIN') ?? false;
  }

  handleUnauthorized(): void {
    this.clearSession(true);
  }

  persistSessionData(session: SessionLike): void {
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
    if ('roles' in session) {
      if (session.roles) {
        localStorage.setItem('roles', session.roles);
      } else {
        localStorage.removeItem('roles');
      }
    }
  }

  clearSession(redirect: boolean): void {
    if (this.isBrowser) {
      localStorage.removeItem('userId');
      localStorage.removeItem('username');
    }

    if (this.loggedIn.value) {
      this.loggedIn.next(false);
    }

    // if (redirect && this.isBrowser) {
    //   const target = '/account/login';
    //   if (this.router.url !== target) {
    //     this.router.navigate([target]);
    //   }
    // }
  }

  private hasStoredSession(): boolean {
    if (!this.isBrowser) {
      return false;
    }
    return !!localStorage.getItem('userId');
  }
}
