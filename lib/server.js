// @ts-check
import { NodeApp } from 'astro/app/node';
import Koa from 'koa';
import serve from 'koa-static';
import koaMount from 'koa-mount';
import { polyfill } from '@astrojs/webapi';
import { fileURLToPath } from 'url';
import { responseIterator } from './response-iterator';

const clientLocalsSymbol = Symbol.for('astro.locals');

polyfill(globalThis, {
  exclude: 'window document',
});

/**
  * @typedef {import('./types').ServerArgs} ServerArgs
  * @typedef {import('./types').DefineFastifyRoutes} DefineFastifyRoutes
  */

  /** @type {DefineFastifyRoutes | undefined} */
  const astroKoaApp =
  // @ts-ignore
typeof _astroKoaApp != 'undefined' ? _astroKoaApp: undefined;

/**
  * 
  * @param {import('astro').SSRManifest} manifest 
  * @param {ServerArgs} options 
  */
  export function start(manifest, options) {
    const app = new NodeApp(manifest);
    const koa = new Koa();

    const clientRoot = new URL(options.clientRelative, import.meta.url);
    const clientAssetsRoot = new URL('.' + options.assetsPrefix, clientRoot + '/');

    koa.use(serve(fileURLToPath(clientAssetsRoot), {
      setHeaders(res) {
        res.setHeader('Cache-Control', 'public,max-age=31536000,immutable');
      }
    }));

    // Fallback route
    koa.use(async (ctx, next) => {
      // Pass locals into app
      const req = ctx.req;
      Reflect.set(req, clientLocalsSymbol, ctx.locals ?? {});

      const routeData = app.match(req, { matchNotFound: true });
      if(routeData) {
        const response = await app.render(req, routeData);
        if(response.headers.get('content-type') === 'text/html' && !response.headers.has('content-encoding')) {
          response.headers.set('content-encoding', 'none');
        }
        await writeWebResponse(app, ctx.res, response);
      }
    });

    if(astroKoaApp) {
      koa.use(koaMount(astroKoaApp));
    }
    
    const port = Number(options.port ?? (process.env.PORT || 8080));

    koa.listen(port);
  }

/**
  * @param {NodeApp} app
  * @param {import('http').ServerResponse} res 
  * @param {Response} webResponse 
  */
  async function writeWebResponse(app, res, webResponse) {
    const { status, headers, body } = webResponse;
    // Support the Astro.cookies API.
      if (app.setCookieHeaders) {
        const setCookieHeaders = Array.from(app.setCookieHeaders(webResponse));
        if (setCookieHeaders.length) {
          res.setHeader('Set-Cookie', setCookieHeaders);
        }
      }
    let headersObj = Object.fromEntries(headers.entries());
    res.writeHead(status, headersObj);
    if (body) {
      for await (const chunk of responseIterator(body)) {
        res.write(chunk);
      }
    }
    res.end();
  }

export function createExports(manifest, options) {
  return {
    start() {
      return start(manifest, options);
    }
  }
}
