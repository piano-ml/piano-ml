import { bootstrapApplication } from '@angular/platform-browser';
import { AppComponent } from './app/app.component';
import { config } from './app/app.config.server';

// Polyfill for __dirname in ESM scope for SSR extraction/rendering
if (typeof (global as any).__dirname === 'undefined') {
  (global as any).__dirname = '';
}

const bootstrap = () => bootstrapApplication(AppComponent, config);

export default bootstrap;
