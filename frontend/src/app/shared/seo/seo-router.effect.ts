import { type EnvironmentProviders, Injectable, inject, makeEnvironmentProviders, provideEnvironmentInitializer } from '@angular/core';
import { type ActivatedRoute, NavigationEnd, NavigationStart, Router } from '@angular/router';
import { type BreadcrumbEntry, breadcrumbStructuredData, resolveBreadcrumbLabel } from './breadcrumbs';
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
        const { seo, trail } = walkRoute(this.router.routerState.root);

        this.seo.setGraph([breadcrumbStructuredData(trail)]);
        this.seo.setRouteSeo(seo, event.urlAfterRedirects);
      }
    });
  }
}

/**
 * Walks from the root down to the deepest activated route, merging the `seo`
 * data so a parent can set defaults a child then refines, and collecting the
 * `breadcrumb` labels into a trail of absolute paths.
 */
function walkRoute(route: ActivatedRoute): { seo: SeoData | undefined; trail: BreadcrumbEntry[] } {
  let current: ActivatedRoute | null = route;
  let seo: SeoData | undefined;
  const trail: BreadcrumbEntry[] = [];
  let url = '';

  while (current) {
    const config = current.snapshot.routeConfig;
    const data = config?.data;

    const routeSeo = data?.['seo'] as SeoData | undefined;
    if (routeSeo) seo = { ...seo, ...routeSeo };

    const path = current.snapshot.url.map(segment => segment.path).join('/');
    if (path) url += `/${path}`;

    const label = resolveBreadcrumbLabel(data?.['breadcrumb'], current.snapshot.data);
    // The home route is the trail's root already, and a wildcard match has no
    // URL of its own worth linking to.
    if (label && url && config?.path !== '**') {
      trail.push({ name: label, url });
    }

    current = current.firstChild;
  }

  return { seo, trail };
}

/** Wires the title / meta / canonical / JSON-LD handling for the whole app. */
export function provideSeo(): EnvironmentProviders {
  return makeEnvironmentProviders([provideEnvironmentInitializer(() => inject(SeoRouterEffect))]);
}
