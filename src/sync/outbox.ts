import { db } from '@/db/dexie';
import type { OutboxRecord } from '@/db/dexie';
import type { SyncTable } from '@/schema/sync';

/**
 * The queue of local writes waiting to reach the server.
 *
 * Keyed by `${table}:${id}` so repeated edits to one character collapse to a
 * single pending entry rather than a growing log — sync pushes whole documents,
 * so only the latest state of each is ever needed.
 */
function keyFor(table: SyncTable, id: string): string {
  return `${table}:${id}`;
}

export async function enqueue(
  table: SyncTable,
  id: string,
  updatedAt: number,
  deleted = false,
): Promise<void> {
  await db.outbox.put({ key: keyFor(table, id), table, id, updatedAt, deleted, queuedAt: Date.now() });
}

export async function pending(limit = 200): Promise<OutboxRecord[]> {
  return db.outbox.orderBy('queuedAt').limit(limit).toArray();
}

export async function pendingCount(): Promise<number> {
  return db.outbox.count();
}

/**
 * Clears entries the server has resolved — accepted *and* rejected alike. A
 * rejection means the server holds a newer version, so retrying would fail
 * identically forever; the newer row arrives on the next pull instead.
 */
export async function clear(entries: { table: SyncTable; id: string }[]): Promise<void> {
  await db.outbox.bulkDelete(entries.map((e) => keyFor(e.table, e.id)));
}
