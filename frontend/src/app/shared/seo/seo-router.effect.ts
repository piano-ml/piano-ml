import { type EnvironmentProviders, Injectable, inject, makeEnvironmentProviders, provideEnvironmentInitializer } from '@angular/core';
import { type ActivatedRoute, NavigationEnd, NavigationStart, Router } from '@angular/router';
import type { SeoData } from './seo.model';
import { SeoService } from './seo.service';

/**
 * Feeds {@link SeoService} from the router: clears the previous page's override
 * when a navigation starts, then applies the `data.seo` declared along the
 * activated route once it ends. Routes that declare nothing still get the site
 * defaults and a self-referencing canonical.
 */
@Injectable({ providedIn: 'root' })
export class SeoRouterEffect {
  private router = inject(Router);
  private seo = inject(SeoService);

  constructor() {
    this.router.events.subscribe(event => {
      if (event instanceof NavigationStart) {
        this.seo.resetOverride();
      } else if (event instanceof NavigationEnd) {
        this.seo.setRouteSeo(collectSeo(this.router.routerState.root), event.urlAfterRedirects);
      }
    });
  }
}

/**
 * Merges the `seo` route data from the root down to the deepest activated
 * route, so a parent can set defaults a child then refines.
 */
function collectSeo(route: ActivatedRoute): SeoData | undefined {
  let current: ActivatedRoute | null = route;
  let merged: SeoData | undefined;

  while (current) {
    const seo = current.snapshot.routeConfig?.data?.['seo'] as SeoData | undefined;
    if (seo) merged = { ...merged, ...seo };
    current = current.firstChild;
  }

  return merged;
}

/** Wires the title / meta / canonical / JSON-LD handling for the whole app. */
export function provideSeo(): EnvironmentProviders {
  return makeEnvironmentProviders([provideEnvironmentInitializer(() => inject(SeoRouterEffect))]);
}
