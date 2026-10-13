/**
 * Dead-simple fixed-window in-memory rate limiter.
 *
 * On Vercel each serverless instance has its own map, so on its own the
 * enforced ceiling is (limit x live instances). That's why it is only a first
 * gate: it turns away a client already known to be over budget without a
 * database round trip, and the shared-key quota proper lives in Postgres
 * (lib/aiQuota.ts), where every instance sees the same count.
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
        // Windows are aligned to the epoch rather than starting at a key's
        // first request, matching the Postgres quota's windows. Otherwise this
        // gate could still be refusing a user into an hour the shared quota
        // has already reset.
        windows.set(key, { count: 1, resetAt: Math.floor(now / windowMs) * windowMs + windowMs });
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
