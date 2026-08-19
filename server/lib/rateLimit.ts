/**
 * Dead-simple fixed-window in-memory rate limiter.
 *
 * In-memory is genuinely the right call here rather than a placeholder for
 * Redis: on Vercel each serverless instance has its own map, so the real
 * enforced ceiling is (limit x live instances). That's a leaky bucket by
 * design — it exists to stop one browser tab hammering the shared Gemini key
 * in a loop, not to be an airtight quota. Anything stricter needs per-user
 * accounting in Postgres, which arrives with accounts in Phase 2.
 */
interface Window {
  count: number;
  resetAt: number;
}

export interface RateLimiter {
  /** Returns null when allowed, or the seconds to wait when the caller is over budget. */
  check(key: string): number | null;
}

export function createRateLimiter(limit: number, windowMs: number): RateLimiter {
  const windows = new Map<string, Window>();

  return {
    check(key: string): number | null {
      const now = Date.now();
      const existing = windows.get(key);

      if (!existing || now >= existing.resetAt) {
        // Opportunistic sweep so a long-lived instance doesn't accumulate a
        // window per distinct IP forever.
        if (windows.size > 5_000) {
          for (const [k, w] of windows) {
            if (now >= w.resetAt) windows.delete(k);
          }
        }
        windows.set(key, { count: 1, resetAt: now + windowMs });
        return null;
      }

      if (existing.count >= limit) {
        return Math.ceil((existing.resetAt - now) / 1000);
      }

      existing.count += 1;
      return null;
    },
  };
}

/** Best-effort client identity: Vercel sets x-forwarded-for, local dev falls back to the socket. */
export function clientKey(forwardedFor: string | undefined, socketAddress: string | undefined): string {
  const first = forwardedFor?.split(',')[0]?.trim();
  return first || socketAddress || 'unknown';
}
