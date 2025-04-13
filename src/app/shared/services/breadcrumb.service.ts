import { Injectable } from '@angular/core';
// biome-ignore lint/style/useImportType: <explanation>
import { ActivatedRoute, NavigationEnd, Router } from '@angular/router';
import { distinctUntilChanged, filter, map, of, type Observable } from 'rxjs';

interface BreadcrumbItem {
  label: string;
  path?: string;
}

@Injectable({
  providedIn: 'root'
})
export class BreadcrumbService {

  public items$: Observable<BreadcrumbItem[]> = of([])

  constructor(
    private _router: Router,
    private _route: ActivatedRoute
  ) {
    this._router.events.subscribe(event => {
      if (event instanceof NavigationEnd) {
        this.items$ = of(this._buildBreadCrumb(this._route.root));
      }
    })
  }
  private _buildBreadCrumb(route: ActivatedRoute, url = '', breadcrumbs: BreadcrumbItem[] = []): BreadcrumbItem[] {
    const newBreadcrumbs = [...breadcrumbs];
    const path = route.snapshot.url.map(segment => segment.path).join('/');
    const nextUrl = `${url}/${path}`.replace('//', '/');

    // biome-ignore lint/complexity/useOptionalChain: <explanation>
        if (route.routeConfig && route.routeConfig.data && route.routeConfig.data['breadcrumb']) {
      let data = '';

  
      if (route.routeConfig.data['breadcrumb'][0] === '@') {
    
        route.routeConfig.data['breadcrumb'].split('.').forEach((level: string, index: number) => {
          if (index === 0) {
            data = route.snapshot.data[level.substr(1)];
          } else {
            // biome-ignore lint/complexity/noExtraBooleanCast: <explanation>
            // biome-ignore lint/suspicious/noExplicitAny: <explanation>
                        data = !!data ? (data as any)[level] : null;
          }
        });
      } else {
    
        data = route.routeConfig.data['breadcrumb'];
      }

      newBreadcrumbs.push({
        label: data,
        path: nextUrl
      });
    }

    if (route.firstChild) {
      return this._buildBreadCrumb(route.firstChild, nextUrl, newBreadcrumbs);
    }
    return newBreadcrumbs;
  }



}


