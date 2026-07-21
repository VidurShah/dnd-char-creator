import type { ContentEntry, ContentKind } from '@/schema/content';
import type { Edition } from '@/schema/common';
import { contentRepo } from '@/db/repos';

import spells2014 from '@data/2014/spells.json';
import items2014 from '@data/2014/items.json';
import species2014 from '@data/2014/species.json';
import backgrounds2014 from '@data/2014/backgrounds.json';
import feats2014 from '@data/2014/feats.json';
import features2014 from '@data/2014/features.json';

import spells2024 from '@data/2024/spells.json';
import items2024 from '@data/2024/items.json';
import species2024 from '@data/2024/species.json';
import backgrounds2024 from '@data/2024/backgrounds.json';
import feats2024 from '@data/2024/feats.json';
import features2024 from '@data/2024/features.json';

// Each data/<edition>/classes/*.json file holds one class entry plus its
// feature/subclass entries (see scripts/seed/seed-srd51-rules.ts and
// seed-srd52.ts). Globbed eagerly so adding a new class file needs no import
// list maintenance.
function loadClassModules(pattern: Record<string, { default: ContentEntry[] }>): ContentEntry[] {
  return Object.values(pattern).flatMap((mod) => mod.default);
}

const classes2014 = loadClassModules(
  import.meta.glob('@data/2014/classes/*.json', { eager: true }) as Record<string, { default: ContentEntry[] }>,
);
const classes2024 = loadClassModules(
  import.meta.glob('@data/2024/classes/*.json', { eager: true }) as Record<string, { default: ContentEntry[] }>,
);

// Seed content ships as static JSON (never stored in IndexedDB) so new app
// versions "migrate" seed data simply by shipping a new build.
//
// features.json holds only features nothing references — browsable Library
// content. Features that belong to a class, subclass, species, or background
// live alongside their referrer in that entry's own file.
const SEED_BY_EDITION: Record<Edition, ContentEntry[]> = {
  '2014': [
    ...(spells2014 as ContentEntry[]),
    ...(items2014 as ContentEntry[]),
    ...(species2014 as ContentEntry[]),
    ...(backgrounds2014 as ContentEntry[]),
    ...(feats2014 as ContentEntry[]),
    ...(features2014 as ContentEntry[]),
    ...classes2014,
  ],
  '2024': [
    ...(spells2024 as ContentEntry[]),
    ...(items2024 as ContentEntry[]),
    ...(species2024 as ContentEntry[]),
    ...(backgrounds2024 as ContentEntry[]),
    ...(feats2024 as ContentEntry[]),
    ...(features2024 as ContentEntry[]),
    ...classes2024,
  ],
};

/** Seed entries merged with this edition's custom/imported IndexedDB entries. */
export async function loadContentIndex(edition: Edition): Promise<ContentEntry[]> {
  const seed = SEED_BY_EDITION[edition];
  const custom = await contentRepo.listByEdition(edition);

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
