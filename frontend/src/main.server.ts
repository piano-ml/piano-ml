import { bootstrapApplication, BootstrapContext } from '@angular/platform-browser';
import { AppComponent } from './app/app.component';
import { config } from './app/app.config.server';

// Polyfill for __dirname in ESM scope for SSR extraction/rendering
if (typeof (global as any).__dirname === 'undefined') {
  (global as any).__dirname = '';
}

// Polyfill for process.cwd() if it's missing in some environments during SSR extraction
if (typeof (global as any).process === 'undefined') {
  (global as any).process = { cwd: () => '' };
} else if (typeof (global as any).process.cwd === 'undefined') {
  (global as any).process.cwd = () => '';
}

// Polyfill for location to avoid issues with some libraries during SSR
if (typeof (global as any).location === 'undefined') {
  (global as any).location = {
    href: '',
    protocol: 'https:',
    host: 'pianoml.org',
    hostname: 'pianoml.org',
    pathname: '/',
    search: '',
    hash: ''
  };
}

const bootstrap = (context: BootstrapContext) => bootstrapApplication(AppComponent, config, context);

export default bootstrap;
