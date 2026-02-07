import { APP_BASE_HREF } from '@angular/common';
import { CommonEngine } from '@angular/ssr/node'
import { render } from '@netlify/angular-runtime/common-engine.mjs'
import bootstrap from './main.server';


const commonEngine = new CommonEngine({
  bootstrap,
  providers: [{ provide: APP_BASE_HREF, useValue: '/' }]
});

export async function netlifyCommonEngineHandler(request: Request, context: any): Promise<Response> {
  return await render(commonEngine);
}
