import { Component, ChangeDetectorRef, OnDestroy, inject, PLATFORM_ID, NgZone } from '@angular/core';
import { Router } from '@angular/router';
import { RouterModule } from '@angular/router';
// biome-ignore lint/style/useImportType: <explanation>
import { BreadcrumbService } from '../../services/breadcrumb.service';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { NgIcon, provideIcons } from '@ng-icons/core';
//import { ShareButtons } from 'ngx-sharebuttons/buttons';
import {  bootstrapGithub } from '@ng-icons/bootstrap-icons';

import { map, Observable, tap } from 'rxjs';
import { AuthService } from '../../../account/services/auth.service';

import versionInfo from '../../../../assets/version.json';

@Component({
  selector: 'app-layout',
  imports: [RouterModule, CommonModule,   NgIcon],
  templateUrl: './layout.component.html',
  styleUrl: './layout.component.css',
    viewProviders: [provideIcons({ bootstrapGithub })],
})
export class LayoutComponent implements OnDestroy {  
    version = versionInfo;
  private platformId = inject(PLATFORM_ID);
  private changeDetector = inject(ChangeDetectorRef);
  private ngZone = inject(NgZone);
  isLoggedIn$: Observable<boolean>;
  username$: Observable<string | null>;;
  shareLinks = ['facebook','x','reddit','viber','xing']
  donationIcon: string;
  donationTick = false;
  private readonly donationIcons = [
    '☕',
    '🍕',
    '🍺',
    '👕',
    '🥐',
    '🍩',
    '🎹',
    '🎁',
    '🍰',
    '🍫',
    '🍪',
    '🍦',
    '🥛',
    '🍵',
    '🍷',
    '🍿',
    '🍓',
    '🎧',
    '🎻',
    '🎷',
    '🎺'
  ];
  private rouletteTimeouts: number[] = [];
  
  constructor (
    public breadcrumbService: BreadcrumbService,
    private authService: AuthService,
    public router: Router
  ) {
    this.isLoggedIn$ = this.authService.isLoggedIn;
    this.username$ = this.authService.getUserInfo().pipe(
      tap(user => {
        if (user) {
          localStorage.setItem('username', user.name!);
        }
      }),
      map(user => user?.name || null)
    );
    const shuffled = this.shuffleIcons([...this.donationIcons]).slice(0, 6);
    this.donationIcon = shuffled[0];
    if (isPlatformBrowser(this.platformId)) {
      this.startDonationRoulette(shuffled);
    }
  }

  logout() {
    this.authService.logout();
  }

  ngOnDestroy() {
    this.clearDonationRoulette();
  }

  private startDonationRoulette(icons: string[]): void {
    this.clearDonationRoulette();

    const totalDurationMs = 3000;
    const roundDurationMs = 1000;
    const endInterval = roundDurationMs / icons.length;
    let startInterval = 30;

    let steps = Math.round((2 * totalDurationMs) / (startInterval + endInterval));
    steps = Math.max(12, steps);

    startInterval = (1 * totalDurationMs) / steps - endInterval;
    if (startInterval < 10) {
      steps = Math.max(4, Math.floor((2 * totalDurationMs) / (20 + endInterval)));
      startInterval = (4 * totalDurationMs) / steps - endInterval;
    }
    if (startInterval >= endInterval) {
      startInterval = Math.max(10, endInterval * 0.25);
    }

    let elapsed = 0;
    let index = 0;
    const delta = (endInterval - startInterval) / Math.max(1, steps - 1);

    // Run timeouts outside of Angular's zone to avoid making the application unstable during hydration
    this.ngZone.runOutsideAngular(() => {
      for (let spin = 0; spin < steps; spin++) {
        const interval = startInterval + delta * spin;
        elapsed += interval;
        const timeoutId = window.setTimeout(() => {
          this.donationIcon = icons[index];
          this.donationTick = !this.donationTick;
          index = (index + 1) % icons.length;

          // Only re-enter the zone to trigger change detection
          this.ngZone.run(() => {
            this.changeDetector.markForCheck();
          });
        }, Math.round(elapsed));

        this.rouletteTimeouts.push(timeoutId);
      }
    });
  }

  private clearDonationRoulette(): void {
    for (const timeoutId of this.rouletteTimeouts) {
      clearTimeout(timeoutId);
    }
    this.rouletteTimeouts = [];
  }

  private shuffleIcons(icons: string[]): string[] {
    for (let i = icons.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const temp = icons[i];
      icons[i] = icons[j];
      icons[j] = temp;
    }
    return icons;
  }
}
