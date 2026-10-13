import type { NextFunction, Request, RequestHandler, Response } from 'express';

/**
 * Drop-in for server/lib/auth.ts in route tests: the signed-in user is whatever
 * the `x-test-user` header says. Lets a test act as two different accounts
 * without a Clerk instance. The real module's degradation behavior has its own
 * tests in lib/auth.test.ts.
 */
export const clerkConfigured = true;

export function authMiddleware(): RequestHandler {
  return (_req, _res, next) => next();
}

export function currentUserId(req: Request): string | null {
  const user = req.headers['x-test-user'];
  return typeof user === 'string' && user ? user : null;
}

export function requireUser(req: Request, res: Response, next: NextFunction): void {
  if (!currentUserId(req)) {
    res.status(401).json({ error: 'Sign in to use this feature.' });
    return;
  }
  next();
}
