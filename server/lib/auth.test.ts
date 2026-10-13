// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { serve } from '../test/http.js';

/**
 * Auth's deliberate degradation: broken or missing Clerk configuration must
 * cost the features that need an account, never the whole API. A regression
 * here has 500'd every route before (commit 5c476ad), health check and AI
 * proxy included.
 *
 * auth.ts reads its keys at import time, so each case stubs the environment
 * and imports fresh modules.
 */

const clerk = vi.hoisted(() => ({
  middleware: vi.fn(),
  getAuth: vi.fn(),
}));
vi.mock('@clerk/express', () => ({
  clerkMiddleware: () => clerk.middleware,
  getAuth: clerk.getAuth,
}));

async function loadApp(env: Record<string, string>) {
  vi.resetModules();
  for (const key of ['CLERK_SECRET_KEY', 'CLERK_PUBLISHABLE_KEY', 'VITE_CLERK_PUBLISHABLE_KEY', 'NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY']) {
    vi.stubEnv(key, env[key] ?? '');
  }
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  const auth = await import('./auth.js');
  const { createApp } = await import('../app.js');
  return { auth, api: await serve(createApp()) };
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  clerk.middleware.mockReset();
  clerk.getAuth.mockReset();
});

describe('with no Clerk keys', () => {
  it('serves the API with everyone signed out, rather than refusing to boot', async () => {
    const { auth, api } = await loadApp({});
    try {
      expect(auth.clerkConfigured).toBe(false);
      const health = await api.request('GET', '/api/health');
      expect(health).toMatchObject({ status: 200, body: { ok: true, authConfigured: false } });
      expect((await api.request('GET', '/api/me')).body).toEqual({ userId: null });
      // Account-only routes say so; they don't crash.
      expect((await api.request('GET', '/api/sync/pull')).status).toBe(401);
      expect(clerk.middleware).not.toHaveBeenCalled();
    } finally {
      await api.close();
    }
  });
});

describe('with Clerk configured', () => {
  const keys = { CLERK_SECRET_KEY: 'sk_test_x', VITE_CLERK_PUBLISHABLE_KEY: 'pk_test_x' };

  it('accepts the publishable key under any of the names deployments provide', async () => {
    for (const name of ['CLERK_PUBLISHABLE_KEY', 'VITE_CLERK_PUBLISHABLE_KEY', 'NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY']) {
      const { auth, api } = await loadApp({ CLERK_SECRET_KEY: 'sk_test_x', [name]: 'pk_test_x' });
      await api.close();
      expect(auth.clerkConfigured, name).toBe(true);
    }
  });

  it('identifies the user Clerk authenticated', async () => {
    clerk.middleware.mockImplementation((_req: unknown, _res: unknown, next: () => void) => next());
    clerk.getAuth.mockReturnValue({ userId: 'user_123' });
    const { api } = await loadApp(keys);
    try {
      expect((await api.request('GET', '/api/me')).body).toEqual({ userId: 'user_123' });
    } finally {
      await api.close();
    }
  });

  it('treats a request as signed out when Clerk itself fails, instead of 500ing it', async () => {
    clerk.middleware.mockRejectedValue(new Error('Clerk is down'));
    clerk.getAuth.mockImplementation(() => {
      throw new Error('clerkMiddleware did not run');
    });
    const { api } = await loadApp(keys);
    try {
      expect((await api.request('GET', '/api/health')).status).toBe(200);
      expect((await api.request('GET', '/api/me')).body).toEqual({ userId: null });
      expect((await api.request('GET', '/api/sync/pull')).status).toBe(401);
    } finally {
      await api.close();
    }
  });
});
