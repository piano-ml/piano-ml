import { Component } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup } from '@angular/forms';
import { AuthService } from '../../services/auth.service';
import { Router } from '@angular/router';

@Component({
  selector: 'app-account-home',
  standalone: true,
  imports: [ReactiveFormsModule, CommonModule],
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.css']
})
export class AccountHomeComponent {
  isLoggedIn$;
  userInfo: any = {};
  editMode = false;
  nameForm: FormGroup;

  constructor(private authService: AuthService, private fb: FormBuilder, private router: Router) {
    this.nameForm = this.fb.group({
      name: ['']
    });
    this.isLoggedIn$ = this.authService.isLoggedIn;
    this.isLoggedIn$.subscribe(isLoggedIn => {
      if (!isLoggedIn) {
        this.router.navigate(['/account/login']);
      }
    });
    this.loadUserInfo();
  }

  loadUserInfo() {
    this.authService.getUserInfo().subscribe(data => {
      this.userInfo = data;
      this.nameForm.patchValue({ name: data.name });
    });
  }

  enableEdit() {
    this.editMode = true;
  }

  savename() {
    const newname = this.nameForm.value.name;
    this.authService.updateUserInfo({ name: newname }).subscribe(() => {
      this.userInfo.name = newname;
      this.editMode = false;
    });
  }

  logout() {
    this.authService.logout();
    this.router.navigate(['/account/login']);
  }
}
