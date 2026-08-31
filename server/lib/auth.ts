import { clerkMiddleware, getAuth } from '@clerk/express';
import type { Request, RequestHandler, Response, NextFunction } from 'express';

/**
 * Clerk wiring, with one deliberate concession: the app must still run with no
 * Clerk keys configured.
 *
 * Grimoire is local-first — building and playing a character needs no account
 * at all — so a contributor who clones the repo and runs `pnpm dev` without
 * Clerk credentials should get a working app where everyone is simply signed
 * out, not a server that refuses to boot. Every helper here degrades to
 * "anonymous" rather than throwing when the keys are absent.
 */

/**
 * The Express SDK needs the *publishable* key as well as the secret, and it
 * looks for CLERK_PUBLISHABLE_KEY specifically. Nothing provisions that name
 * here: the Vercel Marketplace integration writes NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
 * and the Vite client needs the VITE_ prefix. All three carry the same value,
 * so accept whichever exists rather than making the deployment depend on a
 * hand-added alias.
 *
 * Getting this wrong is not a quiet failure — clerkMiddleware() throws on every
 * request, which 500s the entire API including the health check and the AI
 * proxy, neither of which has anything to do with accounts.
 */
const publishableKey =
  process.env.CLERK_PUBLISHABLE_KEY ||
  process.env.VITE_CLERK_PUBLISHABLE_KEY ||
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

const secretKey = process.env.CLERK_SECRET_KEY;

export const clerkConfigured = Boolean(secretKey && publishableKey);

if (!clerkConfigured) {
  const missing = [!secretKey && 'CLERK_SECRET_KEY', !publishableKey && 'a Clerk publishable key']
    .filter(Boolean)
    .join(' and ');
  console.warn(`[auth] ${missing} not set — all requests will be treated as signed out.`);
}

/**
 * Attaches Clerk's auth state to the request, or does nothing when unconfigured.
 *
 * Errors from Clerk are swallowed into "signed out" rather than propagated.
 * Authentication being broken should cost you the features that need an
 * account, not the whole API.
 */
export function authMiddleware(): RequestHandler {
  if (!clerkConfigured) return (_req, _res, next) => next();

  const middleware = clerkMiddleware({ secretKey, publishableKey });
  return (req, res, next) => {
    Promise.resolve(middleware(req, res, next)).catch((err: unknown) => {
      console.warn('[auth] Clerk failed to authenticate the request:', err instanceof Error ? err.message : err);
      next();
    });
  };
}

/**
 * The signed-in Clerk user id, or null. Never throws: getAuth() errors when the
 * middleware hasn't run, and a failure to identify a user is exactly equivalent
 * to there not being one.
 */
export function currentUserId(req: Request): string | null {
  if (!clerkConfigured) return null;
  try {
    return getAuth(req).userId ?? null;
  } catch {
    return null;
  }
}

/** Route guard for endpoints that require an account. */
export function requireUser(req: Request, res: Response, next: NextFunction): void {
  if (!currentUserId(req)) {
    res.status(401).json({ error: 'Sign in to use this feature.' });
    return;
  }
  next();
}
