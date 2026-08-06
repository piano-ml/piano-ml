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

export function app(): express.Express {
  const server = express();
  server.use(compression());
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
