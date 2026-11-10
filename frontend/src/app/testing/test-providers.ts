import type { EnvironmentProviders, Provider } from '@angular/core';
import { provideHttpClient, withXhr } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { provideBeacon } from 'ng-beacon';
import { provideApi } from '../core/api';

/**
 * The providers component specs in this app need: a router (components use
 * routerLink, ActivatedRoute and navigate() on init), an intercepted HttpClient
 * so no spec reaches the network, the generated API client that sits on top of
 * it, and the guided-tour service.
 *
 * The catch-all route keeps navigate() calls made during initialization from
 * failing to match anything.
 */
export function provideTesting(): (Provider | EnvironmentProviders)[] {
  return [
    provideRouter([{ path: '**', children: [] }]),
    provideHttpClient(withXhr()),
    provideHttpClientTesting(),
    provideApi({ basePath: '' }),
    provideBeacon()
  ];
}
