import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import type { ContentEntry } from '../../src/schema';

/**
 * Node-native equivalent of src/content/loader.ts's seed loading, for use in
 * extraction scripts. That loader is browser-only (import.meta.glob,
 * IndexedDB) and can't run under plain tsx — this reads the same seeded JSON
 * files straight off disk instead. Only used for the SRD-dedupe check, so
 * custom/imported IndexedDB content is irrelevant here anyway.
 */
export function loadSeedEntries(edition: '2014' | '2024'): ContentEntry[] {
  const dataDir = path.resolve(import.meta.dirname, '../../data', edition);
  const files = ['spells.json', 'items.json', 'species.json', 'backgrounds.json', 'feats.json'];
  const entries: ContentEntry[] = [];

  for (const file of files) {
    const filePath = path.join(dataDir, file);
    entries.push(...(JSON.parse(readFileSync(filePath, 'utf-8')) as ContentEntry[]));
  }

  const classesDir = path.join(dataDir, 'classes');
  for (const file of readdirSync(classesDir).filter((f) => f.endsWith('.json'))) {
    entries.push(...(JSON.parse(readFileSync(path.join(classesDir, file), 'utf-8')) as ContentEntry[]));
  }

  return entries;
}
