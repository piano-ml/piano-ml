import { Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { BehaviorSubject, tap, interval, map, Observable } from 'rxjs';
import { AccountCreatePostRequest, AccountLoginPostRequest, AccountService } from '../../core/api';



@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private loggedIn = new BehaviorSubject<boolean>(this.hasValidToken());

  constructor(
    private accountService: AccountService,
    private router: Router
  ) { 
    // Vérifier l'expiration du token toutes les minutes
    interval(60000).subscribe(() => {
      this.checkTokenExpiry();
    });
  }

  get isLoggedIn(): Observable<boolean> {
    return this.loggedIn.asObservable().pipe(
      map(isLoggedIn => {
        if (isLoggedIn) {
          // Vérifier si le token est toujours valide
          const token = this.getToken();
          if (token && this.isTokenExpired(token)) {
            console.log('Token expiré détecté, déconnexion automatique');
            this.logout();
            return false;
          }
        }
        return isLoggedIn;
      })
    );
  }

  getUserId(): string | null {
    return localStorage.getItem('userId');
  }

  login(user: AccountLoginPostRequest) {
    return this.accountService.accountLoginPost(user).pipe(
      tap(response => {
        if (response.token) {
          // Vérifier si le token reçu n'est pas déjà expiré
          if (!this.isTokenExpired(response.token)) {
            localStorage.setItem('token', response.token);
            localStorage.setItem('username', response.username!);
            localStorage.setItem('userId', response.userId!);
            this.loggedIn.next(true);
            this.router.navigate(['/']);
          } else {
            console.error('Token reçu déjà expiré');
            this.loggedIn.next(false);
          }
        }
      })
    );
  }

  logout() {
    localStorage.removeItem('token');
    this.loggedIn.next(false);
    this.router.navigate(['/account/login']);
  }

  getToken(): string | null {
    return localStorage.getItem('token');
  }

  getTokenExpirationInfo(): { isExpired: boolean; expiresAt?: Date; timeUntilExpiry?: number } {
    const token = this.getToken();
    if (!token) {
      return { isExpired: true };
    }

    try {
      const payload = this.decodeJwtPayload(token);
      if (!payload.exp) {
        return { isExpired: false };
      }

      const expiresAt = new Date(payload.exp * 1000);
      const currentTime = Date.now();
      const timeUntilExpiry = expiresAt.getTime() - currentTime;
      const isExpired = timeUntilExpiry <= 0;

      return {
        isExpired,
        expiresAt,
        timeUntilExpiry: Math.max(0, timeUntilExpiry)
      };
    } catch (error) {
      return { isExpired: true };
    }
  }

  private hasToken(): boolean {
    return !!localStorage.getItem('token');
  }

  private hasValidToken(): boolean {
    const token = localStorage.getItem('token');
    if (!token) {
      return false;
    }
    return !this.isTokenExpired(token);
  }

  private isTokenExpired(token: string): boolean {
    try {
      const payload = this.decodeJwtPayload(token);
      if (!payload.exp) {
        return false; // Si pas d'expiration, considérer comme valide
      }
      
      const currentTime = Math.floor(Date.now() / 1000);
      return payload.exp < currentTime;
    } catch (error) {
      console.error('Erreur lors du décodage du JWT:', error);
      return true; // En cas d'erreur, considérer comme expiré
    }
  }

  private decodeJwtPayload(token: string): any {
    const parts = token.split('.');
    if (parts.length !== 3) {
      throw new Error('Token JWT invalide');
    }
    
    const payload = parts[1];
    const decoded = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
    return JSON.parse(decoded);
  }

  private checkTokenExpiry(): void {
    // Force une vérification en émettant la valeur actuelle
    // Cela déclenchera la vérification dans l'observable isLoggedIn
    this.loggedIn.next(this.loggedIn.value);
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
}
