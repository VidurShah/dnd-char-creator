// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDb } from '../test/db.js';
import { serve } from '../test/http.js';
import { aiUsage } from '../db/schema.js';
import { SHARED_AI_LIMIT, SHARED_AI_WINDOW_MS } from '../lib/aiQuota.js';
import { AI_MODEL_IDS } from '../../src/schema/aiProxy.js';

/**
 * The AI proxy's access rules, with Gemini stubbed out. What matters here is
 * who may spend the operator's shared key and how much — the upstream call
 * itself is Google's problem.
 */

const h = vi.hoisted(() => ({
  db: null as unknown,
  dbFails: false,
  generate: vi.fn(),
}));

vi.mock('../db/client.js', () => ({
  dbConfigured: true,
  getDb: () => {
    if (h.dbFails) throw new Error('database unreachable');
    return h.db;
  },
}));
vi.mock('../lib/auth.js', () => import('../test/fakeAuth.js'));
vi.mock('@google/genai/node', () => ({
  GoogleGenAI: class {
    models = { generateContent: h.generate };
  },
}));

vi.stubEnv('GEMINI_API_KEY', 'operator-key');
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
  h.dbFails = false;
  h.generate.mockReset().mockResolvedValue({ text: 'ok', functionCalls: [] });
  await testDb.reset();
});

const model = AI_MODEL_IDS[0];
const generate = (opts: { user?: string; body?: Record<string, unknown> } = {}) =>
  api.request('POST', '/api/ai/generate', {
    user: opts.user,
    body: { model, contents: [{ role: 'user', parts: [{ text: 'hi' }] }], ...opts.body },
  });

describe('who may use the shared key', () => {
  it('refuses a signed-out caller with no key of their own', async () => {
    expect((await generate()).status).toBe(401);
    expect(h.generate).not.toHaveBeenCalled();
  });

  it('lets a signed-out caller spend their own key on any model', async () => {
    const res = await generate({ body: { apiKey: 'their-key', model: 'some-other-model' } });
    expect(res.status).toBe(200);
    expect(h.generate).toHaveBeenCalledWith(expect.objectContaining({ model: 'some-other-model' }));
  });

  it('holds the shared key to the model allowlist', async () => {
    expect((await generate({ user: 'alice', body: { model: 'gemini-ultra-expensive' } })).status).toBe(400);
    expect((await generate({ user: 'alice' })).status).toBe(200);
  });
});

describe('shared-key quota (#17)', () => {
  it('enforces the limit from Postgres, so it holds across serverless instances', async () => {
    // Another instance has already spent this user's whole window. This
    // instance's in-memory gate has never seen them, so only the shared count
    // can refuse the request.
    const windowStart = Math.floor(Date.now() / SHARED_AI_WINDOW_MS) * SHARED_AI_WINDOW_MS;
    await testDb.db.insert(aiUsage).values({ userId: 'bob', windowStart, count: SHARED_AI_LIMIT });

    const res = await generate({ user: 'bob' });
    expect(res.status).toBe(429);
    expect(Number(res.headers.get('retry-after'))).toBeGreaterThan(0);
    expect(h.generate).not.toHaveBeenCalled();
  });

  it('never counts requests made with the caller’s own key', async () => {
    await generate({ user: 'carol', body: { apiKey: 'their-key' } });
    expect(await testDb.db.select().from(aiUsage)).toEqual([]);
  });

  it('fails open to the in-memory gate when the database is down', async () => {
    h.dbFails = true;
    expect((await generate({ user: 'dave' })).status).toBe(200);
  });
});
