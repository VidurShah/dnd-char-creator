import { Router } from 'express';
import { createRateLimiter, clientKey } from '../lib/rateLimit.js';

/**
 * Gemini proxy. Ported from the old vite-plugins/geminiProxy.ts, which only
 * ever ran inside the Vite dev/preview server — meaning a deployed static
 * build had no AI at all. Same contract, same request/response shape, now on a
 * real endpoint that exists in production.
 *
 * The point of the proxy is unchanged: GEMINI_API_KEY stays server-side. It is
 * read from process.env with no VITE_ prefix, so it is never part of
 * import.meta.env, the client bundle, or any network payload — unless the
 * player has explicitly pasted their own override key in Settings, which
 * travels in the request body and is used in place of ours.
 */

/** Upstream ceiling. These preview/thinking models intermittently stall under load. */
const UPSTREAM_TIMEOUT_MS = 90_000;

/**
 * Only requests falling back to *our* key are limited — a player using their
 * own pasted key is spending their own quota, so throttling them is pointless.
 */
const sharedKeyLimiter = createRateLimiter(30, 60 * 60 * 1000);

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

  const usingSharedKey = !body.apiKey;
  const apiKey = body.apiKey || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    res.status(400).json({
      error: 'No Gemini API key configured — set GEMINI_API_KEY on the server, or paste one in Settings.',
    });
    return;
  }

  if (usingSharedKey) {
    const retryAfter = sharedKeyLimiter.check(clientKey(req.get('x-forwarded-for'), req.socket.remoteAddress));
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
