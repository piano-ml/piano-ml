import { APP_BASE_HREF } from '@angular/common';
import { renderApplication } from '@angular/platform-server';
import express from 'express';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import bootstrap from './main.server';

const serverDistFolder = dirname(fileURLToPath(import.meta.url));
const browserDistFolder = resolve(serverDistFolder, '../browser');
const indexHtml = readFileSync(join(browserDistFolder, 'index.csr.html'), 'utf-8');

const app = express();

/**
 * Serve static files from /browser
 */
app.get('*.*', express.static(browserDistFolder, {
  maxAge: '1y'
}));

/**
 * Handle all other requests by rendering the Angular application.
 */
app.get('*', async (req, res, next) => {
  try {
    const html = await renderApplication(bootstrap, {
      document: indexHtml,
      url: req.url,
      platformProviders: [{ provide: APP_BASE_HREF, useValue: req.baseUrl }]
    });
    
    res.send(html);
  } catch (err) {
    next(err);
  }
});

/**
 * Start the server if this module is the main entry point.
 */
const port = process.env['PORT'] || 4000;
app.listen(port, () => {
  console.log(`Node Express server listening on http://localhost:${port}`);
});


