import type { ContentEntry } from '@/schema/content';

export function normalizeName(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
}

/** Finds an entry of the same kind and normalized name in another edition's content pool. */
export function findCrossEditionMatch(
  name: string,
  kind: ContentEntry['kind'],
  otherEditionEntries: ContentEntry[],
): ContentEntry | undefined {
  const target = normalizeName(name);
  if (!target) return undefined;
  return otherEditionEntries.find((e) => e.kind === kind && normalizeName(e.name) === target);
}
