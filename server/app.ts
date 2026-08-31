import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import { aiRouter } from './routes/ai.js';
import { authMiddleware, clerkConfigured, currentUserId } from './lib/auth.js';

/**
 * The Grimoire API, as one Express app with two entry points so local and
 * production run identical code:
 *
 *   - local:  server/dev.ts listens on :3000, and Vite proxies /api to it
 *             (see vite.config.ts)
 *   - Vercel: api/index.ts exports this app as a Node serverless function,
 *             and vercel.json rewrites /api/* to it
 *
 * Static assets are NOT served from here. Vite owns them in dev, and Vercel's
 * static hosting owns them in production (vercel.json rewrites everything that
 * isn't /api to the SPA's index.html).
 */

/**
 * Vercel's Node runtime may have already read and parsed the request body
 * before the app sees it. Running express.json() over an
 * already-consumed stream hangs until the function times out, so only parse
 * when nothing else has.
 */
function parseJsonBody(req: Request, res: Response, next: NextFunction): void {
  if (req.body !== undefined) {
    next();
    return;
  }
  // Generous limit: AI requests carry a whole system prompt built from the
  // character sheet plus the running conversation.
  express.json({ limit: '2mb' })(req, res, next);
}

export function createApp(): Express {
  const app = express();

  // Trust Vercel's proxy so req.ip / x-forwarded-for reflect the real client.
  app.set('trust proxy', true);
  app.disable('x-powered-by');

  app.use(parseJsonBody);

  // Populates Clerk auth state on every request. Routes decide for themselves
  // whether an account is required; nothing is protected wholesale, because
  // most of Grimoire works fine signed out.
  app.use(authMiddleware());

  /**
   * Mounted twice on purpose. Locally, Vite proxies the untouched path and
   * Express sees /api/ai/generate. On Vercel the request arrives via a
   * rewrite, and while the original path is normally preserved, the bare
   * function path (/ai/generate) is cheap to support and removes any
   * dependence on that behavior.
   */
  for (const prefix of ['/api', '']) {
    app.get(`${prefix}/health`, (req, res) => {
      res.json({ ok: true, seenPath: req.originalUrl, authConfigured: clerkConfigured });
    });

    // Lets the SPA render the right header state without guessing from a
    // token it can't verify.
    app.get(`${prefix}/me`, (req, res) => {
      res.json({ userId: currentUserId(req) });
    });
    app.use(`${prefix}/ai`, aiRouter);
  }

  app.use((req, res) => {
    res.status(404).json({ error: `No API route for ${req.method} ${req.originalUrl}` });
  });

  return app;
}
