import { ChangeDetectionStrategy, Component, DestroyRef, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { loginQueryParams } from '../../services/return-url';
import { ACCOUNT_TABS } from './account-tabs';
import { KeepInViewDirective } from '../../../shared/directives/keep-in-view.directive';

/** The account page: a tab bar (one child route per tab) over the selected section. */
@Component({
  selector: 'app-account-home',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, KeepInViewDirective],
  templateUrl: './home.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AccountHomeComponent {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  readonly tabs = ACCOUNT_TABS;

  constructor() {
    this.authService.isLoggedIn.pipe(takeUntilDestroyed(inject(DestroyRef))).subscribe(isLoggedIn => {
      if (!isLoggedIn) {
        this.router.navigate(['/account/login'], { queryParams: loginQueryParams(this.router.url) });
      }
    });
  }
}
