import { ChangeDetectionStrategy, ChangeDetectorRef, Component, DestroyRef, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { isCsrfRejection } from '../../../interceptors/xsrf.interceptor';
import { AuthService } from '../../../services/auth.service';

/** "Me" tab of the account page: the user's identity, logout and account deletion. */
@Component({
  selector: 'app-account-me',
  imports: [ReactiveFormsModule],
  templateUrl: './me.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AccountMeComponent {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly destroyRef = inject(DestroyRef);

  // biome-ignore lint/suspicious/noExplicitAny: user info is untyped in AuthService
  userInfo: any = {};
  editMode = false;
  readonly nameForm = inject(FormBuilder).group({ name: [''] });

  showDeleteConfirmation = false;
  deleting = false;
  deleteError: string | null = null;

  constructor() {
    this.loadUserInfo();
  }

  loadUserInfo() {
    this.authService.getUserInfo().pipe(takeUntilDestroyed(this.destroyRef)).subscribe(data => {
      this.userInfo = data;
      this.nameForm.patchValue({ name: data.name });
      this.cdr.markForCheck();
    });
  }

  enableEdit() {
    this.editMode = true;
    this.cdr.markForCheck();
  }

  cancelEdit() {
    this.editMode = false;
    this.nameForm.patchValue({ name: this.userInfo.name });
    this.cdr.markForCheck();
  }

  savename() {
    const newname = this.nameForm.value.name;
    this.authService.updateUserInfo({ name: newname }).pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      this.userInfo.name = newname;
      this.editMode = false;
      this.cdr.markForCheck();
    });
  }

  logout() {
    this.authService.logout();
    this.router.navigate(['/account/login']);
  }

  openDeleteConfirmation() {
    this.deleteError = null;
    this.showDeleteConfirmation = true;
    this.cdr.markForCheck();
  }

  cancelDeleteAccount() {
    if (this.deleting) {
      return;
    }
    this.showDeleteConfirmation = false;
    this.deleteError = null;
    this.cdr.markForCheck();
  }

  confirmDeleteAccount() {
    if (this.deleting) {
      return;
    }
    this.deleting = true;
    this.deleteError = null;
    this.cdr.markForCheck();
    this.authService.deleteAccount().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => {
        this.deleting = false;
        this.showDeleteConfirmation = false;
        this.cdr.markForCheck();
        this.logout();
      },
      error: (error: unknown) => {
        this.deleting = false;
        // 401 is handled by authInterceptor (session ended); anything else keeps the modal open.
        this.deleteError = isCsrfRejection(error)
          ? $localize`:@@accountHome.error.session:Your session needs a refresh. Please reload the page and try again.`
          : $localize`:@@accountHome.error.delete:Account deletion failed. Please try again.`;
        this.cdr.markForCheck();
      }
    });
  }
}
