import type { Character } from '@/schema/character';
import type { ContentEntry } from '@/schema/content';

export const CURRENT_CHARACTER_SCHEMA_VERSION = 1;
export const CURRENT_CONTENT_SCHEMA_VERSION = 1;

/**
 * Upgrades an imported/loaded character record to the current schema version.
 * Add a numbered step here whenever CURRENT_CHARACTER_SCHEMA_VERSION bumps —
 * each step takes the record at version N and returns it at version N+1.
 */
export function migrateCharacter(character: Character): Character {
  if (character.schemaVersion === CURRENT_CHARACTER_SCHEMA_VERSION) return character;
  throw new Error(
    `No migration path from character schemaVersion ${character.schemaVersion} to ${CURRENT_CHARACTER_SCHEMA_VERSION}`,
  );
}

export function migrateContentEntry(entry: ContentEntry): ContentEntry {
  if (entry.schemaVersion === CURRENT_CONTENT_SCHEMA_VERSION) return entry;
  throw new Error(
    `No migration path from content schemaVersion ${entry.schemaVersion} to ${CURRENT_CONTENT_SCHEMA_VERSION}`,
  );
}
