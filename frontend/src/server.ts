import { APP_BASE_HREF } from '@angular/common';
import { CommonEngine } from '@angular/ssr/node';
import express from 'express';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import bootstrap from './main.server';

const serverDistFolder = dirname(fileURLToPath(import.meta.url));
const browserDistFolder = resolve(serverDistFolder, '../browser');
const indexHtml = join(browserDistFolder, 'index.csr.html');

// CommonEngine for local Express server
const commonEngine = new CommonEngine({
  bootstrap
});

// Express server for local development
export function app(): express.Express {
  const server = express();

  /**
   * Serve static files from /browser
   */
  server.get('*.*', express.static(browserDistFolder, {
    maxAge: '1y'
  }));

  /**
   * Handle all other requests by rendering the Angular application.
   */
  server.get('*', async (req, res, next) => {
    try {
      const html = await commonEngine.render({
        bootstrap,
        documentFilePath: indexHtml,
        url: req.url,
        publicPath: browserDistFolder,
        providers: [{ provide: APP_BASE_HREF, useValue: req.baseUrl }]
      });
      
      res.send(html);
    } catch (err) {
      next(err);
    }
  });

  return server;
}

/**
 * Start the server if this module is the main entry point.
 */
function run(): void {
  const port = process.env['PORT'] || 4000;
  const server = app();
  
  server.listen(port, () => {
    console.log(`Node Express server listening on http://localhost:${port}`);
  });
}

run();

// Netlify handler
export async function netlifyCommonEngineHandler(request: Request, context: any): Promise<Response> {
  // Use dynamic import to avoid loading Netlify runtime in dev mode
  const { render } = await import('@netlify/angular-runtime/common-engine.mjs');
  
  // Create a new CommonEngine instance for Netlify
  const netlifyEngine = new CommonEngine({
    bootstrap
  });
  
  return await render(netlifyEngine);
}
