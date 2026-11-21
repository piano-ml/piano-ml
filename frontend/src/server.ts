import {
  AngularNodeAppEngine,
  createNodeRequestHandler,
  isMainModule,
  writeResponseToNodeResponse,
} from '@angular/ssr/node';
import express from 'express';
import compression from 'compression';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HOME_VARY, homeRedirect } from './app/shared/i18n/locale-negotiation';
import { NO_FRAME_HEADERS, isNoFramePath } from './app/coach/authorize/no-frame';

export function app(): express.Express {
  const server = express();
  // Soundfonts are sent uncompressed: their samples are already Ogg-compressed, and on-the-fly compression
  // drops Content-Length, so a download cut mid-stream gets cached as a truncated file for a year (maxAge below).
  server.use(compression({
    filter: (req, res) => !/\.sf[23]$/i.test(req.path) && compression.filter(req, res),
  }));
  const serverDistFolder = dirname(fileURLToPath(import.meta.url));
  const browserDistFolder = resolve(serverDistFolder, '../browser');

  // Here, we now use the `AngularNodeAppEngine` instead of the `CommonEngine`
  // Cloud Run always sets `X-Forwarded-For`. Angular only trusts `x-forwarded-host`
  // and `x-forwarded-proto` by default, and silently falls back to client-side
  // rendering on any other `X-Forwarded-*` header, which disables SSR entirely.
  const angularNodeAppEngine = new AngularNodeAppEngine({
    trustProxyHeaders: ['x-forwarded-for', 'x-forwarded-proto', 'x-forwarded-host'],
  });

  server.use('/api/**', (req, res) => res.json({ hello: 'foo' }));

  // The OAuth consent page (coach, issue #414) must never be framed: a page on another site could otherwise
  // overlay it and trick the user into clicking Allow.
  server.use((req, res, next) => {
    if (isNoFramePath(req.path)) {
      for (const [name, value] of Object.entries(NO_FRAME_HEADERS)) res.setHeader(name, value);
    }
    next();
  });

  // The only language redirect: `/` goes to the language in the `lang` cookie (set by the switcher), else
  // the best Accept-Language match. English is served at `/` itself. Deep links are never redirected.
  server.get('/', (req, res, next) => {
    res.setHeader('Vary', HOME_VARY);
    const query = req.originalUrl.indexOf('?');
    const target = homeRedirect(req.headers.cookie, req.headers['accept-language'], query < 0 ? '' : req.originalUrl.slice(query));
    if (!target) return next();
    res.setHeader('Cache-Control', 'private, no-cache');
    res.redirect(302, target);
  });

  server.get(
    '**',
    express.static(browserDistFolder, {
      maxAge: '1y',
      index: 'index.html',
    })
  );

  // With this config, /404 will not reach the Angular app
  server.get('/404', (req, res, next) => {
    res.send('Express is serving this server only error');
  });

  server.get('**', (req, res, next) => {
    // Yes, this is executed in devMode via the Vite DevServer
    console.log('request', req.url, res.status);

    angularNodeAppEngine
      .handle(req, { server: 'express' })
      .then((response) =>
        response ? writeResponseToNodeResponse(response, res) : next()
      )
      .catch(next);
  });

  return server;
}

const server = app();
if (isMainModule(import.meta.url)) {
  const port = process.env['PORT'] || 4000;
  server.listen(port, () => {
    console.log(`Node Express server listening on http://localhost:${port}`);
  });
}

console.warn('Node Express server started');

// This exposes the RequestHandler
export const reqHandler = createNodeRequestHandler(server);
