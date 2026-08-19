import express, { type Express } from 'express';
import { aiRouter } from './routes/ai';

/**
 * The Grimoire API, as one Express app with two entry points so local and
 * production run identical code:
 *
 *   - local:  server/dev.ts listens on :3000, and Vite proxies /api to it
 *             (see vite.config.ts)
 *   - Vercel: api/[...path].ts exports this app as a Node serverless function,
 *             and vercel.json rewrites /api/* to it
 *
 * Static assets are NOT served from here. Vite owns them in dev, and Vercel's
 * static hosting owns them in production (vercel.json rewrites everything that
 * isn't /api to the SPA's index.html).
 */
export function createApp(): Express {
  const app = express();

  // Trust Vercel's proxy so req.ip / x-forwarded-for reflect the real client.
  app.set('trust proxy', true);
  app.disable('x-powered-by');

  // Generous limit: AI requests carry a whole system prompt built from the
  // character sheet plus the running conversation.
  app.use(express.json({ limit: '2mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  app.use('/api/ai', aiRouter);

  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'Not found' });
  });

  return app;
}
