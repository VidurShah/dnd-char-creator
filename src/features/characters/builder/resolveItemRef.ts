import type { ContentEntry } from '@/schema/content';

/**
 * Background/class equipment data stores item refs as short slugs (e.g.
 * "clothes-common") rather than the full content id ("2014/item/clothes-common"),
 * since that's the form the source API used. Resolves a slug or a full id to
 * the actual item entry.
 */
export function resolveItemRef(items: ContentEntry[], slugOrId: string): ContentEntry | undefined {
  return items.find((i) => i.id === slugOrId || i.id.endsWith(`/${slugOrId}`));
}
