import { ChangeDetectionStrategy, Component, DestroyRef, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { loginQueryParams } from '../../services/return-url';

export interface AccountTab {
  path: string;
  label: string;
  testId: string;
}

/** The account page: a tab bar (one child route per tab) over the selected section. */
@Component({
  selector: 'app-account-home',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AccountHomeComponent {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  readonly tabs: AccountTab[] = [
    { path: 'me', label: $localize`:@@accountHome.tab.me:Me`, testId: 'tab-me' },
    { path: 'ai', label: $localize`:@@accountHome.tab.ai:AI`, testId: 'tab-ai' },
    { path: 'practice', label: $localize`:@@accountHome.practice:Practice`, testId: 'tab-practice' },
    { path: 'scores', label: $localize`:@@accountHome.myScores:My Scores`, testId: 'tab-scores' },
    { path: 'playlists', label: $localize`:@@accountHome.myPlaylists:My Playlists`, testId: 'tab-playlists' },
  ];

  constructor() {
    this.authService.isLoggedIn.pipe(takeUntilDestroyed(inject(DestroyRef))).subscribe(isLoggedIn => {
      if (!isLoggedIn) {
        this.router.navigate(['/account/login'], { queryParams: loginQueryParams(this.router.url) });
      }
    });
  }
}
