import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { db } from '@/db/dexie';
import { enqueue, pendingCount } from './outbox';
import { requestSync, setSyncEnabled } from './syncEngine';

/**
 * Auth is stubbed so these tests stay hermetic. Without it they'd pick up
 * whatever Clerk key happens to be in .env (Vite exposes VITE_ vars to vitest)
 * and block on a real Clerk instance that never loads in jsdom.
 */
vi.mock('@/features/auth/authToken', () => ({
  getAuthToken: () => Promise.resolve(null),
  withAuthHeaders: (h: Record<string, string>) => Promise.resolve(h),
}));

/**
 * These cover the failure modes that lose data silently: a rejected push that
 * never drains, a cursor that advances past unapplied rows, and a tombstone
 * that doesn't delete.
 */

const character = {
  id: 'c1',
  edition: '2014' as const,
  name: 'Thorin',
  createdAt: 1,
  updatedAt: 500,
  schemaVersion: 1,
  build: {
    abilityMethod: 'standardArray' as const,
    baseAbilities: { str: 15, dex: 12, con: 14, int: 10, wis: 11, cha: 8 },
    species: { ref: '2014/species/dwarf', decisions: [] },
    background: { ref: '2014/background/soldier', decisions: [] },
    classes: [{ classRef: '2014/class/fighter', levels: 1, decisionsByLevel: {} }],
    levelOrder: [{ classRef: '2014/class/fighter' }],
    knownSpells: [],
    preparedSpells: [],
    feats: [],
    abilityImprovements: [],
  },
  state: {
    hp: { current: 12, tempHp: 0 },
    hitDiceSpent: {},
    conditions: [],
    exhaustion: 0,
    deathSaves: { successes: 0, failures: 0 },
    spellSlotsSpent: [],
    pactSlotsSpent: 0,
    resourcesSpent: {},
    inventory: [],
    currency: { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 },
    inspiration: false,
  },
};

function jsonResponse(body: unknown, ok = true, status = 200) {
  return Promise.resolve({
    ok,
    status,
    json: () => Promise.resolve(body),
  } as Response);
}

describe('sync engine', () => {
  /** Installs a fetch stub and turns sync on, in that order. */
  async function withResponses(handler: (url: string) => Promise<Response>) {
    vi.mocked(globalThis.fetch).mockImplementation((input) => handler(String(input)));
    await setSyncEnabled(true);
    await requestSync();
  }

  beforeEach(async () => {
    await db.outbox.clear();
    await db.characters.clear();
    await db.settings.clear();
    await setSyncEnabled(false);
    vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
      jsonResponse({ accepted: [], rejected: [], records: [], cursor: 0, hasMore: false }),
    );
  });

  afterEach(async () => {
    await setSyncEnabled(false);
    vi.restoreAllMocks();
  });

  it('drains both accepted and rejected pushes from the outbox', async () => {
    await db.characters.put(character as never);
    await enqueue('characters', 'c1', 500);
    await enqueue('characters', 'c2', 600, true);

    await withResponses((url) => {
      if (url.includes('/push')) {
        return jsonResponse({
          accepted: [{ table: 'characters', id: 'c1' }],
          // c2 lost to a newer server copy.
          rejected: [{ table: 'characters', id: 'c2' }],
        });
      }
      return jsonResponse({ records: [], cursor: 0, hasMore: false });
    });
    expect(await pendingCount()).toBe(0);
  });

  it('leaves the outbox intact when the push fails, so nothing is lost', async () => {
    await db.characters.put(character as never);
    await enqueue('characters', 'c1', 500);

    await withResponses(() => jsonResponse({ error: 'offline' }, false, 500));
    expect(await pendingCount()).toBe(1);
  });

  it('applies a pulled document and advances the cursor', async () => {
    await withResponses((url) => {
      if (url.includes('/push')) return jsonResponse({ accepted: [], rejected: [] });
      if (url.includes('since=0')) {
        return jsonResponse({
          records: [
            { table: 'characters', id: 'c1', doc: character, updatedAt: 500, deleted: false, rev: 7 },
          ],
          cursor: 7,
          hasMore: false,
        });
      }
      return jsonResponse({ records: [], cursor: 7, hasMore: false });
    });

    expect((await db.characters.get('c1'))?.name).toBe('Thorin');
    expect((await db.settings.get('syncCursor'))?.value).toBe(7);
  });

  it('applies a tombstone by deleting the local row', async () => {
    await db.characters.put(character as never);

    await withResponses((url) => {
      if (url.includes('/push')) return jsonResponse({ accepted: [], rejected: [] });
      if (url.includes('since=0')) {
        return jsonResponse({
          records: [{ table: 'characters', id: 'c1', doc: null, updatedAt: 900, deleted: true, rev: 9 }],
          cursor: 9,
          hasMore: false,
        });
      }
      return jsonResponse({ records: [], cursor: 9, hasMore: false });
    });

    expect(await db.characters.get('c1')).toBeUndefined();
  });

  it('skips a malformed document instead of aborting the whole batch', async () => {
    await withResponses((url) => {
      if (url.includes('/push')) return jsonResponse({ accepted: [], rejected: [] });
      if (url.includes('since=0')) {
        return jsonResponse({
          records: [
            { table: 'characters', id: 'bad', doc: { nope: true }, updatedAt: 1, deleted: false, rev: 1 },
            { table: 'characters', id: 'c1', doc: character, updatedAt: 500, deleted: false, rev: 2 },
          ],
          cursor: 2,
          hasMore: false,
        });
      }
      return jsonResponse({ records: [], cursor: 2, hasMore: false });
    });


    // The good row still lands.
    expect(await db.characters.get('c1')).toBeDefined();
    expect(await db.characters.get('bad')).toBeUndefined();
  });

  it('does nothing at all while signed out', async () => {
    await setSyncEnabled(false);
    const fetchSpy = vi.mocked(globalThis.fetch);
    fetchSpy.mockClear();
    await enqueue('characters', 'c1', 1);
    await requestSync();
    expect(fetchSpy).not.toHaveBeenCalled();
    // The queued change survives for when they sign back in.
    expect(await pendingCount()).toBe(1);
  });
});
