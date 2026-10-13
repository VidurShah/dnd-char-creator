// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDb } from '../test/db.js';
import { aiUsage } from '../db/schema.js';

const h = vi.hoisted(() => ({ db: null as unknown }));
vi.mock('../db/client.js', () => ({ dbConfigured: true, getDb: () => h.db }));

const { consumeSharedAiQuota } = await import('./aiQuota.js');

let testDb: Awaited<ReturnType<typeof createTestDb>>;
beforeAll(async () => {
  testDb = await createTestDb();
  h.db = testDb.db;
});
afterAll(() => testDb.client.close());
beforeEach(() => testDb.reset());

const HOUR = 60 * 60 * 1000;
const t0 = 1_000 * HOUR; // aligned to a window start

describe('consumeSharedAiQuota', () => {
  it('admits exactly `limit` requests per window, then reports the time to reset', async () => {
    for (let i = 0; i < 3; i++) expect(await consumeSharedAiQuota('u', t0 + i, 3, HOUR)).toBeNull();
    // 15 minutes into the window: 45 minutes left.
    expect(await consumeSharedAiQuota('u', t0 + 15 * 60 * 1000, 3, HOUR)).toBe(45 * 60);
  });

  it('cannot be raced past the limit by concurrent requests', async () => {
    const results = await Promise.all(Array.from({ length: 20 }, () => consumeSharedAiQuota('u', t0, 5, HOUR)));
    expect(results.filter((r) => r === null)).toHaveLength(5);
  });

  it('starts fresh in the next window and prunes the old one', async () => {
    for (let i = 0; i < 4; i++) await consumeSharedAiQuota('u', t0, 3, HOUR);
    expect(await consumeSharedAiQuota('u', t0 + HOUR, 3, HOUR)).toBeNull();

    const rows = await testDb.db.select().from(aiUsage);
    expect(rows).toEqual([{ userId: 'u', windowStart: t0 + HOUR, count: 1 }]);
  });

  it('keeps users independent', async () => {
    for (let i = 0; i < 3; i++) await consumeSharedAiQuota('a', t0, 3, HOUR);
    expect(await consumeSharedAiQuota('a', t0, 3, HOUR)).not.toBeNull();
    expect(await consumeSharedAiQuota('b', t0, 3, HOUR)).toBeNull();
  });
});
