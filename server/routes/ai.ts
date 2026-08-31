import { Router } from 'express';
import { createRateLimiter } from '../lib/rateLimit.js';
import { clerkConfigured, currentUserId } from '../lib/auth.js';

/**
 * Gemini proxy. GEMINI_API_KEY stays server-side: it is read from process.env
 * with no VITE_ prefix, so it is never part of import.meta.env, the client
 * bundle, or any network payload.
 *
 * Two ways to use this endpoint:
 *
 *   - Signed in       -> falls back to the server's shared key, rate-limited
 *                        per user.
 *   - Own pasted key  -> uses that key, no limit, no account needed.
 *
 * On a deployment with accounts, signed-out visitors cannot spend the shared
 * key. Before accounts existed the limit was per IP, which is trivially
 * bypassed and made the public deployment's Gemini quota a free-for-all.
 *
 * When Clerk is NOT configured there are no accounts to require, and the only
 * person the shared key can belong to is whoever runs the server — so it stays
 * open. Otherwise a local `pnpm dev` clone with a GEMINI_API_KEY in .env would
 * be locked out of its own key with no way to sign in.
 */

/** Upstream ceiling. These preview/thinking models intermittently stall under load. */
const UPSTREAM_TIMEOUT_MS = 90_000;

/** Per-user budget on the shared key. Own-key requests are never limited. */
const sharedKeyLimiter = createRateLimiter(50, 60 * 60 * 1000);

interface GenerateBody {
  apiKey?: string;
  model: string;
  contents: unknown;
  config: unknown;
}

export const aiRouter: Router = Router();

aiRouter.post('/generate', async (req, res) => {
  const body = req.body as GenerateBody;

  if (!body || typeof body.model !== 'string' || !body.model) {
    res.status(400).json({ error: 'Request must include a model.' });
    return;
  }

  const ownKey = body.apiKey?.trim();
  const userId = currentUserId(req);

  if (!ownKey && !userId && clerkConfigured) {
    res.status(401).json({
      error: 'Sign in to use the built-in AI, or add your own Gemini API key in Settings.',
    });
    return;
  }

  const apiKey = ownKey || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    res.status(400).json({
      error: 'No Gemini API key configured — set GEMINI_API_KEY on the server, or paste one in Settings.',
    });
    return;
  }

  if (!ownKey && userId) {
    // Unauthenticated local use (no Clerk) is unlimited by design — it's the
    // operator's own key on their own machine.
    const retryAfter = sharedKeyLimiter.check(userId);
    if (retryAfter !== null) {
      res.set('retry-after', String(retryAfter));
      res.status(429).json({
        error: `You've hit the shared AI usage limit. Try again in ${Math.ceil(retryAfter / 60)} min, or add your own Gemini API key in Settings to skip the limit.`,
      });
      return;
    }
  }

  try {
    // Explicit /node subpath — a bare "@google/genai" import can resolve to the
    // package's browser build, which doesn't handle simple API-key auth the
    // same way and causes spurious "expected OAuth2 access token" errors
    // despite a valid key.
    const { GoogleGenAI } = await import('@google/genai/node');
    const ai = new GoogleGenAI({ apiKey, vertexai: false });
    const generate = ai.models.generateContent({
      model: body.model,
      contents: body.contents as never,
      config: body.config as never,
    });
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('TIMEOUT')), UPSTREAM_TIMEOUT_MS),
    );
    const response = await Promise.race([generate, timeout]);
    res.json({ functionCalls: response.functionCalls ?? [], text: response.text ?? '' });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Gemini proxy failed.';
    const timedOut = message === 'TIMEOUT';
    res.status(timedOut ? 504 : 500).json({
      error: timedOut
        ? "The AI model didn't respond in time — it's likely overloaded. Try again shortly."
        : message,
    });
  }
});
