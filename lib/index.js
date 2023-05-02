// @ts-check

import { relative } from 'path';
import { fileURLToPath } from 'url';
import Koa from 'koa';
import compose from 'koa-compose';
import koaMount from 'koa-mount';
import onFinished from 'on-finished';
import { Stream } from 'stream';
import statuses from 'statuses';

const nextSym = Symbol('next');
const clientLocalsSymbol = Symbol.for('astro.locals');

/**
* @typedef {import('astro').AstroUserConfig} AstroUserConfig
@typedef {import('astro').AstroConfig} AstroConfig
* @typedef {import('vite').Plugin} VitePlugin
* 
* @typedef {import('./types').IntegrationOptions} IntegrationOptions
* 
*/

/**
 * @param {string | URL} entry
 */
function entryToPath(entry) {
  if(typeof entry !== 'string') {
    return fileURLToPath(entry);
  }
  return entry;
}

// Sourced from koa.js
function astroKoaRespond (ctx) {
  if (ctx.respond === false) return

  if (!ctx.writable) return

  const res = ctx.res
  let body = ctx.body
  const code = ctx.status

  // ignore body
  if (statuses.empty[code]) {
    // strip headers
    ctx.body = null
    return res.end()
  }

  if (ctx.method === 'HEAD') {
    if (!res.headersSent && !ctx.response.has('Content-Length')) {
      const { length } = ctx.response
      if (Number.isInteger(length)) ctx.length = length
    }
    return res.end()
  }

  // status body
  if (body == null) {
    if (ctx.response._explicitNullBody) {
      ctx.response.remove('Content-Type')
      ctx.response.remove('Transfer-Encoding')
      ctx.length = 0
      return res.end()
    }
    if (ctx.req.httpVersionMajor >= 2) {
      body = String(code)
    } else {
      body = ctx.message || String(code)
    }
    if (!res.headersSent) {
      ctx.type = 'text'
      ctx.length = Buffer.byteLength(body)
    }
    return res.end(body)
  }

  // responses
  if (Buffer.isBuffer(body)) return res.end(body)
  if (typeof body === 'string') return res.end(body)
  if (body instanceof Stream) return body.pipe(res)

  // body: json
  body = JSON.stringify(body)
  if (!res.headersSent) {
    ctx.length = Buffer.byteLength(body)
  }
  res.end(body)
}

async function createKoaApp(server, options) {
  const entry = entryToPath(options.entry);
  const entryModule = await server.ssrLoadModule(entry);
  const koaSetup = entryModule.default;

  const koaApp = new Koa();
  koaSetup(koaApp);
  server.koa = koaApp;
}

/**
* @param {IntegrationOptions} [options]
* @returns {VitePlugin}
*/
function vitePlugin(options) {
  return {
    name: '@wrapperup/astro-koa:vite',
    async configureServer(server) {
      if (!options?.entry) {
        throw new Error('entry is required');
      }

      createKoaApp(server, options);
      server.middlewares.use(async (req, res, next) => {
        const fn = compose(server.koa.middleware);
        const ctx = server.koa.createContext(req, res);

        res.statusCode = 404;

        if (!server.koa.ctxStorage) {
          // @ts-ignore
          fn(ctx)
            .catch(err => ctx.onerror(err));
        } else {
          server.koa.ctxStorage.run(ctx, async () => {
            // @ts-ignore
            await fn(ctx)
              .catch(err => ctx.onerror(err));
          });
        }

        if (res.statusCode === 404) {
          // Koa didn't handle the request, so let Vite handle it.
          Reflect.set(req, clientLocalsSymbol, ctx.locals ?? {});
          next();
        } else {
          // End koa response and write headers.
          onFinished(res, err => ctx.onerror(err));
          astroKoaRespond(ctx)
        }
      });
    },

    transform(code, id) {
      if(options?.entry && id.includes('@wrapperup/astro-koa/lib/server.js')) {
        let entry = entryToPath(options.entry);
        let outCode = `import _astroKoaApp from "${entry}";\n${code}`;
        return outCode;
      }
    },

    async handleHotUpdate({ server }) {
      if (!options?.entry) {
        throw new Error('entry is required');
      }

      await createKoaApp(server, options);
      console.log('[astro-koa] Reload server entry');
    }
  }
}

/**
* @param {IntegrationOptions} options
* @returns {import('astro').AstroIntegration}
*/
export default function(options) {
  /** @type {import('./types').ServerArgs} */
  let args = /** @type {any} */({});
  args.port = options.port;
  // args.logger = options.logger ?? true;
  /** @type {AstroConfig | undefined} */
  let config;
  return {
    name: '@wrapperup/astro-koa',
    hooks: {
      'astro:config:setup'({ updateConfig }) {
        /** @type {AstroUserConfig} */
        const config = {
          build: {
            assets: 'assets'
          },
          vite: {
            plugins: [vitePlugin(options)]
          }
        }
        updateConfig(config)
      },
      'astro:config:done'({ config: _config, setAdapter }) {
        config = _config;
        setAdapter({
          name: '@wrapperup/astro-koa:adapter',
          serverEntrypoint: fileURLToPath(new URL('./server.js', import.meta.url)),
          exports: ['start'],
          args: args
        });
      },
      'astro:build:setup'({ vite, target }) {
        args.assetsPrefix = '/assets/';
        if(target === 'client') {
          const outputOptions = vite?.build?.rollupOptions?.output;
          if(outputOptions && !Array.isArray(outputOptions)) {
            Object.assign(outputOptions, {
              entryFileNames: 'assets/[name].[hash].js',
              chunkFileNames: 'assets/chunks/[name].[hash].js'
            });
          }
        }
      },
      'astro:build:start'(...buildStartArgs) {
        /** @type {import('astro').AstroConfig['build'] | undefined} */
        let bc;
        if(buildStartArgs.length > 0 && /** @type {any} */(buildStartArgs)[0].buildConfig) {
          bc = /** @type {any} */(buildStartArgs)[0].buildConfig;
        } else {
          bc = config?.build;
        }
        if(bc) {
          args.clientRelative = relative(fileURLToPath(bc.server), fileURLToPath(bc.client));
        }
      }
    }
  };
}
