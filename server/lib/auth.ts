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
export const clerkConfigured = Boolean(process.env.CLERK_SECRET_KEY);

if (!clerkConfigured) {
  console.warn('[auth] CLERK_SECRET_KEY is not set — all requests will be treated as signed out.');
}

/** Attaches Clerk's auth state to the request, or does nothing when unconfigured. */
export function authMiddleware(): RequestHandler {
  if (!clerkConfigured) return (_req, _res, next) => next();
  return clerkMiddleware();
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
