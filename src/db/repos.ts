import { db } from './dexie';
import { CharacterSchema, type Character } from '@/schema/character';
import { ContentEntrySchema, type ContentEntry } from '@/schema/content';
import { PackSchema, type Pack } from '@/schema/pack';

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
  },
  async remove(id: string): Promise<void> {
    await db.characters.delete(id);
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
  },
  async remove(id: string): Promise<void> {
    await db.content.delete(id);
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
