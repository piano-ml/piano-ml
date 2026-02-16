import { Injectable, PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { BehaviorSubject, Observable } from 'rxjs';

interface SessionLike {
  userId?: string | null;
  username?: string | null;
  roles?: string | null;
}

@Injectable({
  providedIn: 'root'
})
export class SessionStorageService {
  private loggedIn = new BehaviorSubject<boolean>(this.hasStoredSession());
  private platformId = inject(PLATFORM_ID);
  private isBrowser: boolean;

  constructor() {
    this.isBrowser = isPlatformBrowser(this.platformId);
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

  isAdmin(): boolean {
    if (!this.isBrowser) {
      return false;
    }
    const roles = localStorage.getItem('roles');
    return roles?.split(',').map(s => s.trim()).includes('ADMIN') ?? false;
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
    
    this.loggedIn.next(!!this.getUserId());
  }

  clearSession(): void {
    console.log('Clearing session data');
    if (this.isBrowser) {
      localStorage.removeItem('userId');
      localStorage.removeItem('username');
      localStorage.removeItem('roles');
    }
    
    if (this.loggedIn.value) {
      this.loggedIn.next(false);
    }
  }

  private hasStoredSession(): boolean {
    if (!this.isBrowser) {
      return false;
    }
    return !!localStorage.getItem('userId');
  }
}
