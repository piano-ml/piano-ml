import { isPlatformBrowser } from '@angular/common';
import { Component, Inject, Renderer2, ViewChild, ElementRef, ChangeDetectorRef } from '@angular/core';
import { PLATFORM_ID } from '@angular/core';
import { AfterViewInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { RouterModule } from '@angular/router';
// biome-ignore lint/style/useImportType: <explanation>
import { BreadcrumbService } from '../../services/breadcrumb.service';
import { CommonModule } from '@angular/common';
import { NgIcon, provideIcons } from '@ng-icons/core';
//import { ShareButtons } from 'ngx-sharebuttons/buttons';
import {  bootstrapGithub } from '@ng-icons/bootstrap-icons';

import { map, Observable, tap } from 'rxjs';
import { AuthService } from '../../../account/services/auth.service';

@Component({
  selector: 'app-layout',
  imports: [RouterModule, CommonModule,   NgIcon],
  templateUrl: './layout.component.html',
  styleUrl: './layout.component.css',
    viewProviders: [provideIcons({ bootstrapGithub })],
})
export class LayoutComponent implements AfterViewInit, OnDestroy {  
  isLoggedIn$: Observable<boolean>;
  username$: Observable<string | null>;;
  shareLinks = ['facebook','x','reddit','viber','xing']
  showBmcFallback = true;
  private destroyed = false;

  @ViewChild('bmcButtonContainer', { static: false })
  private bmcButtonContainer?: ElementRef<HTMLElement>;
  
  constructor (
    public breadcrumbService: BreadcrumbService,
    private authService: AuthService,
    public router: Router,
    private renderer: Renderer2,
    @Inject(PLATFORM_ID) private platformId: object,
    private cdr: ChangeDetectorRef
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
  }

  ngAfterViewInit(): void {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }

    if (!this.bmcButtonContainer?.nativeElement) {
      return;
    }

    if (document.getElementById('bmc-button-script')) {
      return;
    }

    const script = this.renderer.createElement('script') as HTMLScriptElement;
    script.id = 'bmc-button-script';
    script.type = 'text/javascript';
    script.src = 'https://cdnjs.buymeacoffee.com/1.0.0/button.prod.min.js';
    script.setAttribute('data-name', 'bmc-button');
    script.setAttribute('data-slug', 'emmanuelflg');
    script.setAttribute('data-color', '#FFDD00');
    script.setAttribute('data-emoji', '');
    script.setAttribute('data-font', 'Cookie');
    script.setAttribute('data-text', 'buy me a t-shirt');
    script.setAttribute('data-outline-color', '#000000');
    script.setAttribute('data-font-color', '#000000');
    script.setAttribute('data-coffee-color', '#ffffff');

    script.onload = () => {
      if (this.destroyed) {
        return;
      }
      const hasButton = !!document.querySelector('.bmc-button');
      this.showBmcFallback = !hasButton;
      this.cdr.detectChanges();
    };

    script.onerror = () => {
      if (this.destroyed) {
        return;
      }
      this.showBmcFallback = true;
      this.cdr.detectChanges();
    };

    this.renderer.appendChild(this.bmcButtonContainer.nativeElement, script);
  }

  logout() {
    this.authService.logout();
  }

  ngOnDestroy(): void {
    this.destroyed = true;
  }
}
