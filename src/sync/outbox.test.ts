import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '@/db/dexie';
import { enqueue, pending, pendingCount, clear } from './outbox';

describe('sync outbox', () => {
  beforeEach(async () => {
    await db.outbox.clear();
  });

  it('collapses repeated edits of one document into a single entry', async () => {
    await enqueue('characters', 'c1', 100);
    await enqueue('characters', 'c1', 200);
    await enqueue('characters', 'c1', 300);

    const queued = await pending();
    expect(queued).toHaveLength(1);
    // The newest write wins — sync pushes whole documents, so only the latest
    // state matters and an append-only log would be pure waste.
    expect(queued[0].updatedAt).toBe(300);
  });

  it('keeps separate entries per table even for the same id', async () => {
    await enqueue('characters', 'shared-id', 1);
    await enqueue('content', 'shared-id', 1);
    expect(await pendingCount()).toBe(2);
  });

  it('lets a delete supersede a pending save', async () => {
    await enqueue('characters', 'c1', 100);
    await enqueue('characters', 'c1', 200, true);

    const queued = await pending();
    expect(queued).toHaveLength(1);
    expect(queued[0].deleted).toBe(true);
  });

  it('clears accepted and rejected entries alike', async () => {
    await enqueue('characters', 'accepted', 1);
    await enqueue('characters', 'rejected', 1);
    await enqueue('characters', 'untouched', 1);

    // A rejection means the server holds a newer copy; retrying would fail
    // identically forever, so it must leave the queue too.
    await clear([
      { table: 'characters', id: 'accepted' },
      { table: 'characters', id: 'rejected' },
    ]);

    const queued = await pending();
    expect(queued.map((q) => q.id)).toEqual(['untouched']);
  });
});
