import { APP_BASE_HREF } from '@angular/common';
import { CommonEngine } from '@angular/ssr/node'
import { render } from '@netlify/angular-runtime/common-engine.mjs'
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import bootstrap from './main.server';

const serverDistFolder = dirname(fileURLToPath(import.meta.url));
const browserDistFolder = resolve(serverDistFolder, '../browser');
const indexHtml = join(browserDistFolder, 'index.csr.html');

const commonEngine = new CommonEngine({
  bootstrap,
  providers: [{ provide: APP_BASE_HREF, useValue: '/' }]
});

export async function netlifyCommonEngineHandler(request: Request, context: any): Promise<Response> {
  // Example API endpoints can be defined here.
  // Uncomment and define endpoints as necessary.
  // const pathname = new URL(request.url).pathname;
  // if (pathname === '/api/hello') {
  //   return Response.json({ message: 'Hello from the API' });
  // }

  return await render(commonEngine);
}