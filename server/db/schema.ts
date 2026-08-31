import { bigint, index, jsonb, pgTable, primaryKey, text, timestamp } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

/**
 * The server stores character and content documents as opaque JSON.
 *
 * src/schema/character.ts stays the single source of truth for their shape —
 * the server never interprets a doc, only routes it to the right user and
 * orders it for sync. That's what keeps engine changes from needing a
 * server-side migration, and lets computeSheet() stay purely client-side.
 *
 * `rev` is a server-assigned, monotonically increasing cursor drawn from one
 * shared sequence. Sync pulls "everything with rev > my cursor". A timestamp
 * would be the obvious alternative and is wrong: two writes inside the same
 * clock tick are indistinguishable, so a puller can silently skip a row.
 */
export const SYNC_REV_SEQUENCE = 'sync_rev_seq';
const nextRev = sql`nextval('${sql.raw(SYNC_REV_SEQUENCE)}')`;

export const characters = pgTable(
  'characters',
  {
    /** Client-generated character id. */
    id: text('id').notNull(),
    /** Clerk user id. */
    userId: text('user_id').notNull(),
    doc: jsonb('doc').notNull(),
    /**
     * The document's own updatedAt (epoch ms), copied out of the doc for
     * conflict resolution. This is a *client* clock and is only ever compared
     * against another value of the same character, never used for ordering
     * across characters — that's what rev is for.
     */
    updatedAt: bigint('updated_at', { mode: 'number' }).notNull(),
    /** Tombstone. Server-side only, so CharacterSchema needs no deletedAt field. */
    deletedAt: bigint('deleted_at', { mode: 'number' }),
    rev: bigint('rev', { mode: 'number' }).notNull().default(nextRev),
  },
  (t) => [
    // Composite: ids are client-generated, so scoping by user removes any
    // possibility of one account's row colliding with another's.
    primaryKey({ columns: [t.userId, t.id] }),
    index('characters_user_rev_idx').on(t.userId, t.rev),
  ],
);

/**
 * Custom content (origin: 'custom'). Required, not optional: a synced character
 * referencing a user-authored species or feat would render as a dangling ref on
 * a second device if only characters synced.
 */
export const contentEntries = pgTable(
  'content_entries',
  {
    id: text('id').notNull(),
    userId: text('user_id').notNull(),
    doc: jsonb('doc').notNull(),
    updatedAt: bigint('updated_at', { mode: 'number' }).notNull(),
    deletedAt: bigint('deleted_at', { mode: 'number' }),
    rev: bigint('rev', { mode: 'number' }).notNull().default(nextRev),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.id] }),
    index('content_user_rev_idx').on(t.userId, t.rev),
  ],
);

/**
 * In-app feedback. The row is written first and always; filing the GitHub issue
 * is best-effort after it. If the token expires or GitHub is down, the feedback
 * is still captured and the reporter never sees an error.
 */
export const feedback = pgTable(
  'feedback',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull(),
    category: text('category').notNull(),
    message: text('message').notNull(),
    /** Route, app build, edition, character id — whatever the client attached. */
    context: jsonb('context'),
    githubIssueNumber: bigint('github_issue_number', { mode: 'number' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('feedback_user_created_idx').on(t.userId, t.createdAt)],
);
