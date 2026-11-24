import { ChangeDetectionStrategy, Component, DestroyRef, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { bootstrapHeart, bootstrapMusicNote, bootstrapPerson } from '@ng-icons/bootstrap-icons';
import { AuthService } from '../../services/auth.service';
import { loginQueryParams } from '../../services/return-url';
import { ACCOUNT_TABS } from './account-tabs';
import { KeepInViewDirective } from '../../../shared/directives/keep-in-view.directive';
import { aiRectangle, piano } from '../../../shared/icons/custom-icons';

/** The account page: a tab bar (one child route per tab) over the selected section. */
@Component({
  selector: 'app-account-home',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, KeepInViewDirective, NgIcon],
  templateUrl: './home.component.html',
  // Icon and label centered on one line; the AI icon's square fills only 64% of its box, hence its larger size
  styles: `
    .tab-link { display: inline-flex; align-items: center; gap: 0.4em; }
    .tab-icon { display: block; font-size: 1em; }
    .tab-icon-ai { font-size: 1.5em; margin-inline: -0.2em; }
  `,
  viewProviders: [provideIcons({ aiRectangle: aiRectangle.data, piano: piano.data, bootstrapHeart, bootstrapMusicNote, bootstrapPerson })],
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
