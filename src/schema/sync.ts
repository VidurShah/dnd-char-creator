import { z } from 'zod';

/**
 * Wire format for cloud sync. Shared by the client sync engine and the server
 * routes so the contract can't drift between them.
 *
 * Documents travel as opaque JSON: the server stores and orders them but never
 * parses them, so adding a field to CharacterSchema needs no server change.
 * The client validates on the way back in, where the real schema lives.
 */

export const SyncTableSchema = z.enum(['characters', 'content']);
export type SyncTable = z.infer<typeof SyncTableSchema>;

/** One pending local change. */
export const SyncChangeSchema = z.object({
  table: SyncTableSchema,
  id: z.string().min(1),
  /** Absent for a delete. */
  doc: z.unknown().optional(),
  /** The doc's own updatedAt (epoch ms); the conflict clock. */
  updatedAt: z.number().int().nonnegative(),
  deleted: z.boolean().default(false),
});
export type SyncChange = z.infer<typeof SyncChangeSchema>;

export const SyncPushRequestSchema = z.object({
  changes: z.array(SyncChangeSchema).max(500),
});

export const SyncPushResponseSchema = z.object({
  /** Changes the server accepted; the client clears these from its outbox. */
  accepted: z.array(z.object({ table: SyncTableSchema, id: z.string() })),
  /**
   * Changes rejected because the server holds a newer version. Also cleared
   * from the outbox — the client's copy lost, and the newer row arrives on the
   * next pull.
   */
  rejected: z.array(z.object({ table: SyncTableSchema, id: z.string() })),
});
export type SyncPushResponse = z.infer<typeof SyncPushResponseSchema>;

/** One row coming back from the server. `deleted` rows carry no doc. */
export const SyncRecordSchema = z.object({
  table: SyncTableSchema,
  id: z.string(),
  doc: z.unknown().nullable(),
  updatedAt: z.number(),
  deleted: z.boolean(),
  rev: z.number(),
});
export type SyncRecord = z.infer<typeof SyncRecordSchema>;

export const SyncPullResponseSchema = z.object({
  records: z.array(SyncRecordSchema),
  /** Highest rev in this batch; the client's next `since`. */
  cursor: z.number(),
  /** True when more rows remain past the cursor. */
  hasMore: z.boolean(),
});
export type SyncPullResponse = z.infer<typeof SyncPullResponseSchema>;
