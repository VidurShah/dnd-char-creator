import { describe, expect, it } from 'vitest';
import Dexie from 'dexie';
import { CONTENT_STORES, sweepShadowedPackContent } from './dexie';
import type { ContentEntry } from '@/schema/content';

function entry(id: string, origin: ContentEntry['origin'], name: string): ContentEntry {
  return {
    id,
    edition: '2014',
    kind: 'feature',
    name,
    source: { book: 'custom' },
    origin,
    schemaVersion: 1,
    data: { description: `${name} description` },
  };
}

describe('db v1 -> v2: sweep of pack-imported content', () => {
  it('drops origin:"extracted" rows, keeps custom and seed rows, and clears packs', async () => {
    const dbName = `migration-test-${crypto.randomUUID()}`;

    // --- Open at v1 and populate it the way a pack import would have ---
    const v1 = new Dexie(dbName);
    v1.version(1).stores(CONTENT_STORES);
    await v1.open();
    await v1.table('content').bulkAdd([
      // Shares an id with content that now ships committed — this is the row
      // that would silently shadow the built-in version forever.
      entry('2014/feature/extracted-psionic-power', 'extracted', 'Psionic Power'),
      entry('2014/feature/extracted-magical-tinkering', 'extracted', 'Magical Tinkering'),
      // Genuine user-authored content — must survive.
      entry('custom-uuid-1', 'custom', "My Homebrew Feature"),
    ]);
    await v1.table('packs').add({ id: 'tashas', edition: '2014', name: "Tasha's", entries: [] });
    expect(await v1.table('content').count()).toBe(3);
    v1.close();

    // --- Reopen at v2, which runs the upgrade ---
    const v2 = new Dexie(dbName);
    v2.version(1).stores(CONTENT_STORES);
    v2.version(2).stores(CONTENT_STORES).upgrade(sweepShadowedPackContent);
    await v2.open();

    const remaining = (await v2.table('content').toArray()) as ContentEntry[];
    expect(remaining).toHaveLength(1);
    expect(remaining[0].id).toBe('custom-uuid-1');
    expect(remaining[0].origin).toBe('custom');
    expect(await v2.table('packs').count()).toBe(0);

    v2.close();
    await Dexie.delete(dbName);
  });

  it('is a no-op on a database that never imported a pack', async () => {
    const dbName = `migration-test-${crypto.randomUUID()}`;

    const v1 = new Dexie(dbName);
    v1.version(1).stores(CONTENT_STORES);
    await v1.open();
    await v1.table('content').add(entry('custom-uuid-2', 'custom', 'Only Homebrew'));
    v1.close();

    const v2 = new Dexie(dbName);
    v2.version(1).stores(CONTENT_STORES);
    v2.version(2).stores(CONTENT_STORES).upgrade(sweepShadowedPackContent);
    await v2.open();

    expect(await v2.table('content').count()).toBe(1);
    v2.close();
    await Dexie.delete(dbName);
  });
});
