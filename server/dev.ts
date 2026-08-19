import { createApp } from './app';

/**
 * Local API server. Started alongside Vite by `pnpm dev`; Vite proxies /api
 * here (see vite.config.ts) so the browser only ever talks to one origin,
 * exactly as it will in production.
 *
 * Env comes from .env via tsx's --env-file flag in the dev script.
 */
const port = Number(process.env.PORT ?? 3000);

createApp().listen(port, () => {
  console.info(`[api] listening on http://localhost:${port}`);
});
