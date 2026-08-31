import { db } from '@/db/dexie';
import { CharacterSchema } from '@/schema/character';
import { ContentEntrySchema } from '@/schema/content';
import {
  SyncPullResponseSchema,
  SyncPushResponseSchema,
  type SyncRecord,
} from '@/schema/sync';
import { withAuthHeaders } from '@/features/auth/authToken';
import { clear, pending, pendingCount } from './outbox';

/**
 * Cloud sync: push the outbox, then pull everything newer than our cursor.
 *
 * Local-first is preserved throughout. Dexie remains the copy the UI renders,
 * and applying pulled rows writes back through Dexie, so the existing
 * useLiveQuery call sites in CharactersPage and CharacterSheetPage re-render
 * with no changes — reactivity comes free.
 *
 * Conflicts resolve last-write-wins on each document's own updatedAt. See
 * issue #1 for the limitation that implies.
 */

const CURSOR_KEY = 'syncCursor';

export type SyncStatus =
  | { state: 'idle'; lastSyncedAt: number | null; pending: number }
  | { state: 'syncing'; lastSyncedAt: number | null; pending: number }
  | { state: 'error'; lastSyncedAt: number | null; pending: number; error: string }
  | { state: 'off'; lastSyncedAt: null; pending: number };

type Listener = (status: SyncStatus) => void;

/** A status without the pending count, which setStatus fills in from the outbox. */
type StatusInput =
  | { state: 'idle'; lastSyncedAt: number | null }
  | { state: 'syncing'; lastSyncedAt: number | null }
  | { state: 'error'; lastSyncedAt: number | null; error: string }
  | { state: 'off'; lastSyncedAt: null };

let listeners: Listener[] = [];
let status: SyncStatus = { state: 'off', lastSyncedAt: null, pending: 0 };
/**
 * The in-flight run, if any. Holding the promise (rather than a boolean) is
 * what lets requestSync() resolve only when the work is actually done — a
 * caller awaiting it, whether the "Sync now" button or a test, would otherwise
 * be told the sync finished the moment it was merely coalesced into a run
 * already underway.
 */
let currentRun: Promise<void> | null = null;
let rerunRequested = false;
/** Set by the app once Clerk reports a signed-in user. */
let enabled = false;

export function subscribeToSync(listener: Listener): () => void {
  listeners.push(listener);
  listener(status);
  return () => {
    listeners = listeners.filter((l) => l !== listener);
  };
}

async function setStatus(next: StatusInput): Promise<void> {
  status = { ...next, pending: await pendingCount() };
  for (const l of listeners) l(status);
}

/**
 * Turns sync on or off as the session changes. Signing out stops syncing but
 * deliberately leaves the local vault and the outbox intact — the data is still
 * the user's, and it uploads when they sign back in.
 */
export async function setSyncEnabled(next: boolean): Promise<void> {
  if (enabled === next) return;
  enabled = next;
  if (enabled) {
    await requestSync();
  } else {
    await setStatus({ state: 'off', lastSyncedAt: null });
  }
}

async function getCursor(): Promise<number> {
  const row = await db.settings.get(CURSOR_KEY);
  return typeof row?.value === 'number' ? row.value : 0;
}

async function setCursor(value: number): Promise<void> {
  await db.settings.put({ key: CURSOR_KEY, value });
}

/**
 * Writes one pulled row into Dexie.
 *
 * Documents are validated here rather than trusted: they were last written by
 * a possibly older build of the app, and a malformed row should be skipped
 * instead of corrupting the local vault or throwing mid-batch.
 */
async function applyRecord(record: SyncRecord): Promise<void> {
  const table = record.table === 'characters' ? db.characters : db.content;

  if (record.deleted) {
    await table.delete(record.id);
    return;
  }

  const schema = record.table === 'characters' ? CharacterSchema : ContentEntrySchema;
  const parsed = schema.safeParse(record.doc);
  if (!parsed.success) {
    console.warn(`[sync] skipping malformed ${record.table} ${record.id}`, parsed.error.issues[0]);
    return;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- one of two concrete table types, narrowed above
  await (table as any).put(parsed.data);
}

async function push(): Promise<void> {
  const queued = await pending();
  if (queued.length === 0) return;

  const changes = await Promise.all(
    queued.map(async (entry) => ({
      table: entry.table,
      id: entry.id,
      updatedAt: entry.updatedAt,
      deleted: entry.deleted,
      doc: entry.deleted
        ? undefined
        : entry.table === 'characters'
          ? await db.characters.get(entry.id)
          : await db.content.get(entry.id),
    })),
  );

  // A queued row whose document has since vanished locally is a delete that
  // raced its own upload; treat it as one rather than pushing an empty doc.
  const payload = changes.map((c) => (c.doc || c.deleted ? c : { ...c, deleted: true }));

  const res = await fetch('/api/sync/push', {
    method: 'POST',
    headers: await withAuthHeaders({ 'content-type': 'application/json' }),
    body: JSON.stringify({ changes: payload }),
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `Push failed (${res.status})`);

  const { accepted, rejected } = SyncPushResponseSchema.parse(await res.json());
  await clear([...accepted, ...rejected]);
}

async function pull(): Promise<void> {
  // Paginated: keep asking until the server says there's nothing newer, so a
  // first sync on a large vault completes rather than truncating at one page.
  for (;;) {
    const since = await getCursor();
    const res = await fetch(`/api/sync/pull?since=${since}`, {
      headers: await withAuthHeaders({}),
    });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `Pull failed (${res.status})`);

    const { records, cursor, hasMore } = SyncPullResponseSchema.parse(await res.json());
    for (const record of records) await applyRecord(record);

    // Advance only after the batch is applied. Crashing mid-batch then replays
    // it, which is safe because every apply is an idempotent put or delete.
    if (cursor > since) await setCursor(cursor);
    if (!hasMore || records.length === 0) return;
  }
}

async function runOnce(): Promise<void> {
  try {
    await setStatus({ state: 'syncing', lastSyncedAt: status.lastSyncedAt });
    await push();
    await pull();
    await setStatus({ state: 'idle', lastSyncedAt: Date.now() });
  } catch (err) {
    // A failed run deliberately leaves the outbox untouched, so nothing is
    // lost — the next run retries it.
    await setStatus({
      state: 'error',
      lastSyncedAt: status.lastSyncedAt,
      error: err instanceof Error ? err.message : 'Sync failed.',
    });
  }
}

/**
 * Runs a sync, coalescing concurrent requests. Resolves once the work is
 * genuinely finished, including any run queued while this one was in flight.
 */
export async function requestSync(): Promise<void> {
  if (!enabled) return;

  if (currentRun) {
    rerunRequested = true;
    await currentRun;
    return;
  }

  do {
    rerunRequested = false;
    currentRun = runOnce();
    try {
      await currentRun;
    } finally {
      currentRun = null;
    }
  } while (rerunRequested);
}

/** Periodic and on-focus syncing. Returns a teardown for the caller's effect. */
export function startSyncScheduler(intervalMs = 60_000): () => void {
  const onVisible = () => {
    if (document.visibilityState === 'visible') void requestSync();
  };
  const timer = setInterval(() => void requestSync(), intervalMs);
  document.addEventListener('visibilitychange', onVisible);
  window.addEventListener('online', onVisible);
  return () => {
    clearInterval(timer);
    document.removeEventListener('visibilitychange', onVisible);
    window.removeEventListener('online', onVisible);
  };
}
