import { and, eq, lt, sql } from 'drizzle-orm';
import { getDb } from '../db/client.js';
import { aiUsage } from '../db/schema.js';

/**
 * Per-user quota on the shared Gemini key, enforced in Postgres so every
 * serverless instance sees the same count.
 *
 * Fixed windows aligned to the epoch (so every instance agrees on where a
 * window starts without coordinating), and one atomic upsert per request:
 * INSERT ... ON CONFLICT DO UPDATE SET count = count + 1 RETURNING count. Two
 * concurrent requests can't both read "49" and both proceed, the way a SELECT
 * followed by an UPDATE would allow.
 *
 * The in-memory limiter stays in front of this as a cheap first gate (see
 * routes/ai.ts): a client already known to be over budget is turned away
 * without a query. It can only ever reject early, never admit past this check.
 */

export const SHARED_AI_LIMIT = 50;
export const SHARED_AI_WINDOW_MS = 60 * 60 * 1000;

/**
 * Counts one shared-key request against the user's window. Returns null when
 * the request is within budget, or the seconds until the window resets.
 *
 * Rejected requests still count. That is deliberate rather than a side effect
 * of the upsert: a client looping past its limit should not get a cheaper path
 * than one that stopped.
 */
export async function consumeSharedAiQuota(
  userId: string,
  now = Date.now(),
  limit = SHARED_AI_LIMIT,
  windowMs = SHARED_AI_WINDOW_MS,
): Promise<number | null> {
  const db = getDb();
  const windowStart = Math.floor(now / windowMs) * windowMs;

  const [row] = await db
    .insert(aiUsage)
    .values({ userId, windowStart, count: 1 })
    .onConflictDoUpdate({
      target: [aiUsage.userId, aiUsage.windowStart],
      set: { count: sql`${aiUsage.count} + 1` },
    })
    .returning({ count: aiUsage.count });

  // First request of a new window: prune this user's expired windows. Scoped
  // by the primary key's leading column and run at most once per user per
  // window, so the table stays at roughly one row per active user.
  if (row.count === 1) {
    await db.delete(aiUsage).where(and(eq(aiUsage.userId, userId), lt(aiUsage.windowStart, windowStart)));
  }

  if (row.count <= limit) return null;
  return Math.max(1, Math.ceil((windowStart + windowMs - now) / 1000));
}
