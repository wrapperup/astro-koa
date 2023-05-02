# astro-koa
Currently HIGHLY EXPERIMENTAL! Use at your own risk.

Based on https://github.com/matthewp/astro-fastify/

## Demo
https://user-images.githubusercontent.com/7478134/235602792-1869dc79-3e5a-4a79-a527-5f215e40f7f7.mp4


## Features
- Embed your entire Koa app
- Hot-reloads your Koa app
- Supports Koa middleware
- Unofficial Astro middleware support (requires fork).
  - Pass any state into `ctx.locals`.
  - Access your locals with `Astro.locals` in your Astro page.
- Supports `koa-router`

## (EXPERIMENTAL) Astro Middleware
Astro middleware support is not required to use this plugin, only if you require access inside your Astro pages. It's a very fresh and unstable feature. Use at your own risk!

Since it isn't possible yet to access `Astro.locals` in adapters, I created a fork of Astro that adds the ability to do so.
See here: https://github.com/brickadia/astro/tree/expose-locals

Use this plugin's `next-astro-locals` branch. You may have to change the package.json versions of astro.
