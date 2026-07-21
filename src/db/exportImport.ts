import { db } from './dexie';
import {
  CharacterExportFileSchema,
  VaultExportFileSchema,
  type CharacterExportFile,
  type VaultExportFile,
} from '@/schema/exportFile';
import type { Character } from '@/schema/character';
import { contentRepo, characterRepo } from './repos';

function collectReferencedContentIds(character: Character): string[] {
  const ids = new Set<string>();
  ids.add(character.build.species.ref);
  ids.add(character.build.background.ref);
  for (const c of character.build.classes) {
    ids.add(c.classRef);
    if (c.subclassRef) ids.add(c.subclassRef);
  }
  for (const f of character.build.feats) ids.add(f.ref);
  for (const s of character.build.knownSpells) ids.add(s);
  for (const item of character.state.inventory) {
    if (item.itemRef) ids.add(item.itemRef);
  }
  return [...ids];
}

export async function exportCharacter(id: string): Promise<CharacterExportFile> {
  const character = await characterRepo.get(id);
  if (!character) throw new Error(`Character ${id} not found`);

  const referencedIds = collectReferencedContentIds(character);
  const customContent = (
    await Promise.all(referencedIds.map((refId) => contentRepo.get(refId)))
  ).filter((entry): entry is NonNullable<typeof entry> => entry != null && entry.origin !== 'seed');

  return CharacterExportFileSchema.parse({
    kind: 'character-export',
    exportedAt: Date.now(),
    character,
    customContent,
  });
}

export async function importCharacter(file: unknown): Promise<Character> {
  const parsed = CharacterExportFileSchema.parse(file);
  await db.transaction('rw', db.characters, db.content, async () => {
    for (const entry of parsed.customContent) {
      await db.content.put(entry);
    }
    await db.characters.put(parsed.character);
  });
  return parsed.character;
}

export async function exportVault(): Promise<VaultExportFile> {
  const [characters, content] = await Promise.all([db.characters.toArray(), db.content.toArray()]);
  return VaultExportFileSchema.parse({
    kind: 'vault-export',
    exportedAt: Date.now(),
    characters,
    content,
  });
}

export async function importVault(file: unknown): Promise<void> {
  const parsed = VaultExportFileSchema.parse(file);
  await db.transaction('rw', db.characters, db.content, async () => {
    for (const entry of parsed.content) {
      await db.content.put(entry);
    }
    for (const character of parsed.characters) {
      await db.characters.put(character);
    }
  });
}
