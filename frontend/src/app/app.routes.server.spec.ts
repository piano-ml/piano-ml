import { RenderMode } from '@angular/ssr';
import { serverRoutes } from './app.routes.server';

const modeOf = (path: string) => serverRoutes.find(route => route.path === path)?.renderMode;

describe('serverRoutes', () => {
  it('renders private pages in the browser only (the session is not visible server-side)', () => {
    for (const path of ['account', 'account/**', 'import', 'import/**']) {
      expect(modeOf(path), path).toBe(RenderMode.Client);
    }
  });

  it('keeps browser-only workbench routes client-rendered', () => {
    for (const path of ['work', 'work/**', 'workbench', 'workbench/**', 'desktop', 'desktop/**']) {
      expect(modeOf(path), path).toBe(RenderMode.Client);
    }
  });

  it('server-renders everything else, with the catch-all last', () => {
    expect(serverRoutes.at(-1)).toEqual({ path: '**', renderMode: RenderMode.Server });
    expect(serverRoutes.filter(route => route.path === '**')).toHaveLength(1);
  });
});
