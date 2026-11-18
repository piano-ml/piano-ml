import { isPlatformBrowser } from '@angular/common';
import { PLATFORM_ID, inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../account/services/auth.service';
import { LOGIN_PATH, loginQueryParams } from '../account/services/return-url';

/**
 * Admin pages (issue #410): admins pass, logged-out visitors go to login, other users to the home page.
 * UX only: the backend answers 401/403 on /admin/** whatever the frontend does.
 */
export const adminGuard: CanActivateFn = (_route, state) => {
  const auth = inject(AuthService);
  if (auth.isAdmin()) {
    return true;
  }
  if (!isPlatformBrowser(inject(PLATFORM_ID))) {
    return false; // never rendered on the server (RenderMode.Client): the session lives in the browser
  }
  const router = inject(Router);
  return auth.getUserId()
    ? router.createUrlTree(['/'])
    : router.createUrlTree([LOGIN_PATH], { queryParams: loginQueryParams(state.url) });
};
