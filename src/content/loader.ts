import type { ContentEntry, ContentKind } from '@/schema/content';
import type { Edition } from '@/schema/common';
import { contentRepo } from '@/db/repos';

type JsonModule = { default: ContentEntry[] };
type Glob = Record<string, () => Promise<JsonModule>>;

/**
 * Seed content, one lazily-loaded chunk per edition.
 *
 * Statically importing both editions put every byte of spells.json and
 * items.json for 2014 *and* 2024 into the entry bundle — about 1.9 MB of raw
 * JSON, downloaded and parsed before first paint. A character is edition-locked
 * by design, so a player opening a 5e sheet was paying the full cost of 5.5e
 * content they can never reference.
 *
 * Non-eager glob instead: each file becomes its own chunk, fetched only when an
 * edition is first asked for. `loadContentIndex` was already async and
 * useContentIndex already renders a loading state, so nothing above this had to
 * change.
 *
 * Globbed rather than listed so adding a class or content file needs no import
 * list maintenance — the same reason the classes directory was already globbed.
 */
const SEED_GLOBS: Record<Edition, Glob[]> = {
  '2014': [
    import.meta.glob('@data/2014/*.json') as Glob,
    import.meta.glob('@data/2014/classes/*.json') as Glob,
  ],
  '2024': [
    import.meta.glob('@data/2024/*.json') as Glob,
    import.meta.glob('@data/2024/classes/*.json') as Glob,
  ],
};

/**
 * Parsed seed entries per edition. Seed content is immutable for the life of a
 * build — new app versions "migrate" it simply by shipping new JSON — so one
 * fetch-and-parse per edition per session is all that is ever needed, and
 * switching back and forth between editions stays instant.
 */
const seedCache = new Map<Edition, Promise<ContentEntry[]>>();

function loadSeed(edition: Edition): Promise<ContentEntry[]> {
  let pending = seedCache.get(edition);
  if (!pending) {
    // Cached as the promise, not the result: two components mounting at once
    // would otherwise each kick off their own fetch of the same chunks.
    pending = Promise.all(
      SEED_GLOBS[edition].flatMap((glob) => Object.values(glob).map((importModule) => importModule())),
    ).then((modules) => modules.flatMap((m) => m.default));
    seedCache.set(edition, pending);
  }
  return pending;
}

/** Seed entries merged with this edition's custom/imported IndexedDB entries. */
export async function loadContentIndex(edition: Edition): Promise<ContentEntry[]> {
  const [seed, custom] = await Promise.all([loadSeed(edition), contentRepo.listByEdition(edition)]);

  const merged = new Map<string, ContentEntry>();
  for (const entry of seed) merged.set(entry.id, entry);
  for (const entry of custom) merged.set(entry.id, entry); // custom entries win on id collision
  return [...merged.values()];
}

export function groupByKind(entries: ContentEntry[]): Partial<Record<ContentKind, ContentEntry[]>> {
  const groups: Partial<Record<ContentKind, ContentEntry[]>> = {};
  for (const entry of entries) {
    (groups[entry.kind] ??= []).push(entry);
  }
  return groups;
}

/** Resolves crossEditionRef aliases to the entry they point to. */
export function resolveEntry(entry: ContentEntry, byId: Map<string, ContentEntry>): ContentEntry {
  if (entry.crossEditionRef) {
    const target = byId.get(entry.crossEditionRef);
    if (target) return target;
  }
  return entry;
}
