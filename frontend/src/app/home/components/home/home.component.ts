import { isPlatformBrowser } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, type AfterViewInit, inject, PLATFORM_ID, signal } from '@angular/core';
// biome-ignore lint/style/useImportType: <explanation>
import { Router, RouterModule } from '@angular/router';
import { noop } from 'rxjs';
import { HomeglComponent } from '../homegl/homegl.component';
import { HomecssComponent } from '../homecss/homecss.component';
import { environment } from '../../../../environments/environment';

@Component({
  selector: 'app-home',
  imports: [RouterModule, HomeglComponent, HomecssComponent],
  templateUrl: './home.component.html',
  styleUrl: './home.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomeComponent implements AfterViewInit {

  private http = inject(HttpClient);
  private platformId = inject(PLATFORM_ID);
  private isBrowser: boolean;

  isMobileOrTablet = signal<boolean>(false);

  constructor(private router: Router) {
    this.isBrowser = isPlatformBrowser(this.platformId);

    if (this.isBrowser) {
      const mediaQuery = window.matchMedia('(max-width: 1024px)');
      this.isMobileOrTablet.set(mediaQuery.matches);

      // Optional: listen for changes if user resizes window
      mediaQuery.addEventListener('change', (e) => {
        this.isMobileOrTablet.set(e.matches);
      });
    }
  }

  summary() {
    this.router.navigate(['summary']);
  }

  ngAfterViewInit(): void {
    if (this.isBrowser) {
      // Warm up the API server (ignore response and errors), through the API base like every API call.
      // A public endpoint: /account/userinfo answered 401 (this raw request carries no cookie), and the auth
      // interceptor treats any 401 as the end of the session: every homepage visit sent visitors to the login
      // page, and logged users out right after they logged in.
      void this.http.get(`${environment.api}/score/stats`).subscribe({
        next: noop,
        error: noop
      });
    }
  }

}
