import type { ContentEntry } from '@/schema/content';

/**
 * Resolves a `DecisionPoint.optionQuery` string into a concrete list of content
 * ids, so a content author can declare "pick a wizard cantrip" without hand-listing
 * every spell id. Currently only spell queries exist:
 *
 *   "spell:<level>:<classList>"   e.g. "spell:0:wizard" — every wizard cantrip
 *   "spell:<level>"               — every spell of that level, any class list
 *
 * Returns ids sorted by display name. Unknown query shapes resolve to [] so a
 * typo degrades to an empty (visibly wrong, not silently mismatched) choice.
 */
export function resolveOptionQuery(query: string, index: Map<string, ContentEntry>): string[] {
  const [kind, levelStr, classList] = query.split(':');
  if (kind === 'spell') {
    const level = Number(levelStr);
    if (!Number.isFinite(level)) return [];
    return [...index.values()]
      .filter((e) => e.kind === 'spell' && e.data.level === level && (!classList || e.data.classLists.includes(classList)))
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((e) => e.id);
  }
  return [];
}

/** True if a decision point's options come from a spell query — i.e. the chosen ids are spells the character now knows. */
export function isSpellQuery(optionQuery: string | undefined): boolean {
  return optionQuery?.startsWith('spell:') ?? false;
}
