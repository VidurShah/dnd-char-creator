import { db } from './dexie';
import { CharacterSchema, type Character } from '@/schema/character';
import { ContentEntrySchema, type ContentEntry } from '@/schema/content';
import { PackSchema, type Pack } from '@/schema/pack';
import { enqueue } from '@/sync/outbox';
import { requestSync } from '@/sync/syncEngine';

/**
 * Every local write is queued for upload and nudges the sync engine. Writes
 * still land in Dexie first and unconditionally: the local copy is what the UI
 * renders (via useLiveQuery), so sync being unavailable — offline, signed out,
 * or not configured — must never block saving a character.
 */
async function trackWrite(
  table: 'characters' | 'content',
  id: string,
  updatedAt: number,
  deleted = false,
): Promise<void> {
  await enqueue(table, id, updatedAt, deleted);
  void requestSync();
}

// ---------------------------------------------------------------------------
// Characters
// ---------------------------------------------------------------------------

export const characterRepo = {
  async list(): Promise<Character[]> {
    return db.characters.orderBy('updatedAt').reverse().toArray();
  },
  async get(id: string): Promise<Character | undefined> {
    return db.characters.get(id);
  },
  async save(character: Character): Promise<void> {
    const validated = CharacterSchema.parse(character);
    await db.characters.put(validated);
    await trackWrite('characters', validated.id, validated.updatedAt);
  },
  async remove(id: string): Promise<void> {
    await db.characters.delete(id);
    // The tombstone is the outbox entry; Dexie keeps no deleted row.
    await trackWrite('characters', id, Date.now(), true);
  },
};

// ---------------------------------------------------------------------------
// Custom / imported content (seed content is not stored here — see src/content/loader.ts)
// ---------------------------------------------------------------------------

export const contentRepo = {
  async listByEdition(edition: '2014' | '2024'): Promise<ContentEntry[]> {
    return db.content.where('edition').equals(edition).toArray();
  },
  async get(id: string): Promise<ContentEntry | undefined> {
    return db.content.get(id);
  },
  async save(entry: ContentEntry): Promise<void> {
    const validated = ContentEntrySchema.parse(entry);
    await db.content.put(validated);
    // Only user-authored content syncs; seed and pack-imported entries ship
    // with the app or are re-importable, so uploading them would be noise.
    if (validated.origin === 'custom') {
      await trackWrite('content', validated.id, Date.now());
    }
  },
  async remove(id: string): Promise<void> {
    const existing = await db.content.get(id);
    await db.content.delete(id);
    if (existing?.origin === 'custom') {
      await trackWrite('content', id, Date.now(), true);
    }
  },
};

// ---------------------------------------------------------------------------
// Packs (imported extraction output)
// ---------------------------------------------------------------------------

export const packRepo = {
  async list(): Promise<Pack[]> {
    return db.packs.toArray();
  },
  async importPack(pack: Pack): Promise<void> {
    const validated = PackSchema.parse(pack);
    await db.transaction('rw', db.packs, db.content, async () => {
      await db.packs.put(validated);
      for (const entry of validated.entries) {
        await db.content.put(entry);
      }
    });
  },
};

// ---------------------------------------------------------------------------
// Settings (key/value; typed getters for known keys)
// ---------------------------------------------------------------------------

export const settingsRepo = {
  async get<T>(key: string): Promise<T | undefined> {
    const record = await db.settings.get(key);
    return record?.value as T | undefined;
  },
  async set(key: string, value: unknown): Promise<void> {
    await db.settings.put({ key, value });
  },
};
