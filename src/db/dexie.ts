import Dexie, { type EntityTable, type Transaction } from 'dexie';
import type { Character } from '@/schema/character';
import type { ContentEntry } from '@/schema/content';
import type { Pack } from '@/schema/pack';

export interface SettingsRecord {
  key: string;
  value: unknown;
}

/** Schema shared by v1 and v2 — v2 changes no indexes, it only runs the sweep. */
export const CONTENT_STORES = {
  characters: 'id, edition, name, updatedAt',
  content: 'id, edition, kind, name, origin',
  packs: 'id, edition, name',
  settings: 'key',
} as const;

/**
 * Deletes pack-imported content rows (origin:'extracted') that now shadow
 * committed content of the same id. Exported so the migration can be tested
 * against a real v1 -> v2 upgrade rather than only by inspection.
 */
export async function sweepShadowedPackContent(tx: Transaction): Promise<void> {
  const removed = await tx.table('content').where('origin').equals('extracted').delete();
  if (removed > 0) {
    console.info(`[db] removed ${removed} stale pack-imported entries now shipped as committed content`);
  }
  // The pack rows themselves are just import history; clearing them keeps the
  // Library's pack list from advertising content that's now built in.
  await tx.table('packs').clear();
}

class DndDatabase extends Dexie {
  characters!: EntityTable<Character, 'id'>;
  content!: EntityTable<ContentEntry, 'id'>;
  packs!: EntityTable<Pack, 'id'>;
  settings!: EntityTable<SettingsRecord, 'key'>;

  constructor() {
    super('dnd-char-creator');

    this.version(1).stores(CONTENT_STORES);

    // v2: content that used to arrive via "Import Pack" (origin:'extracted')
    // now ships committed in data/<edition>/*.json. Those Dexie rows share ids
    // with the committed entries, and loadContentIndex() lets Dexie win on an
    // id collision — so leaving them would silently shadow the shipped content
    // forever, including any fix or description added to it later.
    //
    // The schema is unchanged; this version exists only to run the cleanup.
    // Genuine user content (origin:'custom') is untouched.
    this.version(2).stores(CONTENT_STORES).upgrade(sweepShadowedPackContent);
  }
}

export const db = new DndDatabase();
