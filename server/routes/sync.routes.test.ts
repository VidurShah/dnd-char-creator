// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { sql } from 'drizzle-orm';
import { createTestDb } from '../test/db.js';
import { serve } from '../test/http.js';
import { MAX_SYNC_DOC_BYTES, MAX_SYNC_ROWS } from '../../src/schema/sync.js';

/**
 * The sync routes against a real Postgres (PGlite), through real HTTP.
 *
 * These are the paths where a regression is invisible from the client: sync
 * appears to work and data quietly goes missing. Each test names the failure
 * it guards against.
 */

const h = vi.hoisted(() => ({ db: null as unknown, configured: true }));

vi.mock('../db/client.js', () => ({
  get dbConfigured() {
    return h.configured;
  },
  getDb: () => h.db,
}));
vi.mock('../lib/auth.js', () => import('../test/fakeAuth.js'));

const { createApp } = await import('../app.js');

let testDb: Awaited<ReturnType<typeof createTestDb>>;
let api: Awaited<ReturnType<typeof serve>>;

beforeAll(async () => {
  testDb = await createTestDb();
  h.db = testDb.db;
  api = await serve(createApp());
});

afterAll(async () => {
  await api.close();
  await testDb.client.close();
});

beforeEach(async () => {
  h.configured = true;
  await testDb.reset();
});

const doc = (name: string, extra: Record<string, unknown> = {}) => ({ name, ...extra });

function change(id: string, updatedAt: number, opts: { doc?: unknown; deleted?: boolean; table?: string } = {}) {
  return {
    table: opts.table ?? 'characters',
    id,
    updatedAt,
    deleted: opts.deleted ?? false,
    ...(opts.deleted ? {} : { doc: opts.doc ?? doc(id) }),
  };
}

const push = (user: string, changes: unknown[]) => api.request('POST', '/api/sync/push', { user, body: { changes } });
const pull = (user: string, since = 0) => api.request('GET', `/api/sync/pull?since=${since}`, { user });

/** Pulls every page, the way the client's loop does. */
async function pullAll(user: string) {
  const records: any[] = [];
  let since = 0;
  for (;;) {
    const { body } = await pull(user, since);
    records.push(...body.records);
    since = body.cursor;
    if (!body.hasMore || body.records.length === 0) return records;
  }
}

describe('access', () => {
  it('requires an account', async () => {
    expect((await api.request('GET', '/api/sync/pull')).status).toBe(401);
    expect((await api.request('POST', '/api/sync/push', { body: { changes: [] } })).status).toBe(401);
  });

  it('answers 503, not a crash, when no database is configured', async () => {
    h.configured = false;
    expect((await pull('alice')).status).toBe(503);
  });

  it('rejects a malformed payload before touching the database', async () => {
    expect((await push('alice', [{ table: 'nope', id: 'x' }])).status).toBe(400);
    expect((await pull('alice', -1)).status).toBe(400);
  });
});

describe('round trip', () => {
  it('returns what was pushed, with tombstones carrying no doc', async () => {
    const res = await push('alice', [
      change('c1', 100),
      change('e1', 100, { table: 'content', doc: { title: 'Homebrew feat' } }),
    ]);
    expect(res.status).toBe(200);
    expect(res.body.accepted).toHaveLength(2);

    await push('alice', [change('c1', 200, { deleted: true })]);

    const records = await pullAll('alice');
    expect(records.find((r) => r.id === 'c1')).toMatchObject({ deleted: true, doc: null, updatedAt: 200 });
    expect(records.find((r) => r.id === 'e1')).toMatchObject({ table: 'content', doc: { title: 'Homebrew feat' } });
  });

  it('scopes rows to their account, even when two accounts use the same id', async () => {
    await push('alice', [change('shared-id', 100, { doc: doc('Alice’s') })]);
    await push('bob', [change('shared-id', 100, { doc: doc('Bob’s') })]);

    expect((await pullAll('alice')).map((r) => r.doc.name)).toEqual(['Alice’s']);
    expect((await pullAll('bob')).map((r) => r.doc.name)).toEqual(['Bob’s']);
  });
});

describe('last-write-wins', () => {
  it('rejects a push older than the stored row and keeps the newer copy', async () => {
    await push('alice', [change('c1', 200, { doc: doc('newer') })]);
    const res = await push('alice', [change('c1', 100, { doc: doc('stale') })]);

    expect(res.body.rejected).toEqual([{ table: 'characters', id: 'c1' }]);
    expect((await pullAll('alice'))[0].doc.name).toBe('newer');
  });

  it('accepts a newer push and an identical re-push', async () => {
    await push('alice', [change('c1', 100, { doc: doc('v1') })]);
    expect((await push('alice', [change('c1', 200, { doc: doc('v2') })])).body.accepted).toHaveLength(1);
    // Same updatedAt: a retry of a push whose response was lost must not be refused.
    expect((await push('alice', [change('c1', 200, { doc: doc('v2') })])).body.accepted).toHaveLength(1);
    expect((await pullAll('alice'))[0].doc.name).toBe('v2');
  });

  it('does not let a stale delete wipe out a newer edit', async () => {
    await push('alice', [change('c1', 300)]);
    await push('alice', [change('c1', 100, { deleted: true })]);
    expect((await pullAll('alice'))[0].deleted).toBe(false);
  });
});

describe('rev cursor', () => {
  it('returns only rows written after the cursor, and re-surfaces an updated row', async () => {
    await push('alice', [change('c1', 100), change('c2', 100)]);
    const first = await pull('alice');
    expect(first.body.records).toHaveLength(2);

    await push('alice', [change('c1', 200, { doc: doc('edited') })]);
    const next = await pull('alice', first.body.cursor);
    expect(next.body.records.map((r: any) => r.id)).toEqual(['c1']);
    expect(next.body.cursor).toBeGreaterThan(first.body.cursor);

    // Nothing newer: the cursor holds where it was.
    const empty = await pull('alice', next.body.cursor);
    expect(empty.body).toMatchObject({ records: [], cursor: next.body.cursor, hasMore: false });
  });

  it('pages a large first sync to completion (#9)', async () => {
    const changes = Array.from({ length: 250 }, (_, i) => change(`c${i}`, 1));
    await push('alice', changes);

    const first = await pull('alice');
    expect(first.body.records).toHaveLength(200);
    expect(first.body.hasMore).toBe(true);

    const all = await pullAll('alice');
    expect(new Set(all.map((r) => r.id)).size).toBe(250);
  });
});

describe('storage limits (#18)', () => {
  it('refuses an oversized document with a 413, writing nothing from that push', async () => {
    const big = doc('big', { blob: 'x'.repeat(MAX_SYNC_DOC_BYTES) });
    const res = await push('alice', [change('ok', 1), change('big', 1, { doc: big })]);

    expect(res.status).toBe(413);
    expect(res.body.oversized).toEqual([{ table: 'characters', id: 'big' }]);
    expect(await pullAll('alice')).toEqual([]);
  });

  it('refuses a push that would take a full vault over the row limit, but still allows shrinking it', async () => {
    // Fill the vault directly; pushing 5,000 rows through the API is slow and beside the point.
    await testDb.db.execute(sql`
      INSERT INTO characters (id, user_id, doc, updated_at)
      SELECT 'c' || g, 'alice', '{}'::jsonb, 1 FROM generate_series(1, ${MAX_SYNC_ROWS}) g`);

    const grow = await push('alice', [change('one-too-many', 1)]);
    expect(grow.status).toBe(413);
    expect(grow.body.error).toMatch(/vault is full/);

    // Rewriting an existing row doesn't grow the row count.
    expect((await push('alice', [change('c1', 2, { doc: { name: 'renamed' } })])).status).toBe(200);
    // And deletes always go through — they're the way back under the limit.
    expect((await push('alice', [change('c2', 2, { deleted: true })])).status).toBe(200);
    // Which makes room for exactly one more.
    expect((await push('alice', [change('one-too-many', 1)])).status).toBe(200);
  });

  it('counts limits per account', async () => {
    await testDb.db.execute(sql`
      INSERT INTO characters (id, user_id, doc, updated_at)
      SELECT 'c' || g, 'alice', '{}'::jsonb, 1 FROM generate_series(1, ${MAX_SYNC_ROWS}) g`);
    expect((await push('bob', [change('c1', 1)])).status).toBe(200);
  });
});
