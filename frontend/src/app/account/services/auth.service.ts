import { Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { BehaviorSubject, tap } from 'rxjs';
import { AccountCreatePostRequest, AccountLoginPostRequest, AccountService } from '../../core/api';



@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private loggedIn = new BehaviorSubject<boolean>(this.hasToken());

  constructor(
    private accountService: AccountService,
    private router: Router
  ) { }

  get isLoggedIn() {
    return this.loggedIn.asObservable();
  }

  login(user: AccountLoginPostRequest) {
    return this.accountService.accountLoginPost(user).pipe(
      tap(response => {
        if (response.token) {
          localStorage.setItem('token', response.token);
          this.loggedIn.next(true);
          this.router.navigate(['/']);
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

  private hasToken(): boolean {
    return !!localStorage.getItem('token');
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
