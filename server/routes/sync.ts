import { Router } from 'express';
import { and, asc, eq, gt, sql } from 'drizzle-orm';
import { getDb, dbConfigured } from '../db/client.js';
import { characters, contentEntries, SYNC_REV_SEQUENCE } from '../db/schema.js';
import { currentUserId, requireUser } from '../lib/auth.js';
import {
  SyncPushRequestSchema,
  type SyncChange,
  type SyncRecord,
} from '../../src/schema/sync.js';

/**
 * Cloud sync. Characters and custom content are per-user document stores; the
 * server orders writes and resolves conflicts but never reads a doc's contents.
 *
 * Conflict policy is last-write-wins on the document's own updatedAt. A push
 * carrying an older updatedAt than the stored row is rejected rather than
 * applied, and the client takes the server's copy on its next pull. This is
 * adequate for one player per vault and is documented as a known limitation in
 * issue #1 — concurrent edits to the same character lose the earlier one.
 */

/** How many rows one pull returns before the client must ask again. */
const PULL_PAGE_SIZE = 200;

const TABLES = { characters, content: contentEntries } as const;

export const syncRouter: Router = Router();

syncRouter.use(requireUser);

syncRouter.use((_req, res, next) => {
  if (!dbConfigured) {
    res.status(503).json({ error: 'Cloud sync is not configured on this server.' });
    return;
  }
  next();
});

syncRouter.post('/push', async (req, res) => {
  const parsed = SyncPushRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Malformed sync payload.' });
    return;
  }
  const userId = currentUserId(req)!;
  const db = getDb();

  const accepted: { table: SyncChange['table']; id: string }[] = [];
  const rejected: { table: SyncChange['table']; id: string }[] = [];

  for (const change of parsed.data.changes) {
    const table = TABLES[change.table];
    const values = {
      id: change.id,
      userId,
      doc: change.deleted ? {} : (change.doc ?? {}),
      updatedAt: change.updatedAt,
      deletedAt: change.deleted ? change.updatedAt : null,
      rev: sql`nextval('${sql.raw(SYNC_REV_SEQUENCE)}')`,
    };

    // One statement, no read-then-write: the WHERE on the DO UPDATE makes the
    // staleness check atomic, so two devices pushing at once can't interleave
    // into a lost update the way a separate SELECT would allow.
    const result = await db
      .insert(table)
      .values(values)
      .onConflictDoUpdate({
        target: [table.userId, table.id],
        set: {
          doc: values.doc,
          updatedAt: values.updatedAt,
          deletedAt: values.deletedAt,
          rev: values.rev,
        },
        where: sql`${table.updatedAt} <= ${change.updatedAt}`,
      })
      .returning({ id: table.id });

    (result.length > 0 ? accepted : rejected).push({ table: change.table, id: change.id });
  }

  res.json({ accepted, rejected });
});

syncRouter.get('/pull', async (req, res) => {
  const since = Number(req.query.since ?? 0);
  if (!Number.isFinite(since) || since < 0) {
    res.status(400).json({ error: '`since` must be a non-negative number.' });
    return;
  }
  const userId = currentUserId(req)!;
  const db = getDb();

  const records: SyncRecord[] = [];
  for (const [name, table] of Object.entries(TABLES) as [keyof typeof TABLES, typeof characters][]) {
    const rows = await db
      .select()
      .from(table)
      .where(and(eq(table.userId, userId), gt(table.rev, since)))
      .orderBy(asc(table.rev))
      .limit(PULL_PAGE_SIZE);

    for (const row of rows) {
      records.push({
        table: name,
        id: row.id,
        doc: row.deletedAt ? null : row.doc,
        updatedAt: row.updatedAt,
        deleted: row.deletedAt != null,
        rev: row.rev,
      });
    }
  }

  // Both tables draw from one sequence, so a single cursor orders them
  // together. Sorting the merged set keeps that true across the page boundary.
  records.sort((a, b) => a.rev - b.rev);
  const page = records.slice(0, PULL_PAGE_SIZE);
  const hasMore = records.length > PULL_PAGE_SIZE;

  res.json({
    records: page,
    cursor: page.length > 0 ? page[page.length - 1].rev : since,
    hasMore,
  });
});
