import { Router } from 'express';
import { createRateLimiter } from '../lib/rateLimit.js';
import { clerkConfigured, currentUserId } from '../lib/auth.js';
import {
  AI_MODEL_IDS,
  GenerateRequestSchema,
  MAX_SHARED_KEY_REQUEST_BYTES,
  sharedKeyRequestBytes,
} from '../../src/schema/aiProxy.js';

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
 *
 * Requests against the shared key are additionally constrained to the model
 * allowlist and a size ceiling (see src/schema/aiProxy.ts). Neither applies to
 * a player's own pasted key. The endpoint is reachable with curl, so those
 * checks have to live here — the client's model dropdown is a UI affordance,
 * not a control.
 */

/** Upstream ceiling. These preview/thinking models intermittently stall under load. */
const UPSTREAM_TIMEOUT_MS = 90_000;

/** Per-user budget on the shared key. Own-key requests are never limited. */
const sharedKeyLimiter = createRateLimiter(50, 60 * 60 * 1000);

export const aiRouter: Router = Router();

aiRouter.post('/generate', async (req, res) => {
  const parsed = GenerateRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Malformed AI request.' });
    return;
  }
  const body = parsed.data;

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

  /**
   * Everything below constrains the *shared* key only. A player spending their
   * own pasted key can ask for whatever model and prompt they like — it is their
   * quota and their bill, and Grimoire has no business policing it.
   *
   * Without these, the endpoint is an open Gemini relay for anyone with an
   * account: model, contents, and config went straight upstream, so the app was
   * merely one possible client of the operator's key.
   */
  if (!ownKey) {
    if (!(AI_MODEL_IDS as readonly string[]).includes(body.model)) {
      res.status(400).json({
        error: `Model "${body.model}" is not available on the shared key. Add your own Gemini API key in Settings to use another model.`,
      });
      return;
    }

    // Measured in schema/aiProxy.ts so the "config counts too" rule is one
    // testable function rather than a line of arithmetic here.
    if (sharedKeyRequestBytes(body) > MAX_SHARED_KEY_REQUEST_BYTES) {
      res.status(413).json({
        // Two very different callers hit this, and the server cannot tell them
        // apart: someone relaying bulk content, and a player whose advisor
        // conversation simply got long. Naming both keeps the second from being
        // told to go buy an API key when the fix is a new chat.
        error:
          'That request is too large for the shared AI. If this is a long advisor conversation, start a new chat — otherwise add your own Gemini API key in Settings.',
      });
      return;
    }
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
