import type { Edition } from '@/schema/common';
import type { ContentEntry, ContentKind } from '@/schema/content';

/**
 * Retrieval for the advisor: picks the content entries a player's question is
 * about, so the model answers from the real rules text instead of from memory —
 * which is where 5e answers go wrong.
 *
 * The Library's search index (content/search.ts) is tuned for typing a name
 * into a box: prefix and fuzzy matching over names *and* descriptions. Fed a
 * whole sentence, that is mostly noise — "I'm grappled. Can I still cast Misty
 * Step?" ranks Modify Memory and Symbol above Misty Step, because "can", "I"
 * and "still" prefix-match half the spell list. So this does two things
 * instead:
 *
 *   1. Name mentions — the strong signal. Players name the thing they're asking
 *      about, usually in lowercase ("can I counterspell that"). Names match
 *      case-insensitively, except the handful that are everyday words ("light
 *      armor" is not a question about the Light cantrip); those need a capital.
 *   2. Name words — the fallback for "how does rage work" or "can I sneak
 *      attack twice", where the name is there but not as an exact phrase:
 *      every word of an entry's name must appear in the question. Fuzzy
 *      search was tried and rejected; it turned "next" into the Net item.
 */

/** Kinds worth citing for a rules question. Class/species/background bodies are huge and already summarized on the sheet. */
const RETRIEVABLE: ReadonlySet<ContentKind> = new Set(['condition', 'spell', 'feat', 'feature', 'item']);

/** When two entries share a name, the more rules-like one wins. */
const KIND_PRIORITY: Record<string, number> = { condition: 0, spell: 1, feat: 2, feature: 3, item: 4 };

export const MAX_RETRIEVED = 5;
/** Per-entry cap on description text sent to the model; keeps a turn's prompt bounded. */
const MAX_DESCRIPTION_CHARS = 2_000;

const STOPWORDS = new Set(
  (
    'a about after again all am an and any are as at be because been before being but by can could did do does ' +
    'doing during each for from get gets got had has have having he her here him his how i if im in into is it ' +
    'its just me might more most my no not now of off on once only or other our out over own same she should so ' +
    'some still such than that the their them then there these they this those through to too under until up use ' +
    'using very was we were what when where which while who whom why will with work works would you your yours ' +
    'character turn round level levels'
  ).split(' '),
);

/**
 * Single-word entry names that are ordinary English in a question about play.
 * Matched only when capitalized. Kept short on purpose: a false positive costs
 * one irrelevant entry in the prompt, a false negative costs the real rules
 * text, so the default is to match.
 */
const COMMON_WORD_NAMES = new Set(
  (
    'light message slow fly jump friends resistance sleep wish aid guidance fear darkness daylight sending ' +
    'suggestion command alarm knock sanctuary mending heroism confusion net rope torch'
  ).split(' '),
);

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export interface RulesIndex {
  retrieve(message: string, opts?: { preferIds?: ReadonlySet<string>; limit?: number }): ContentEntry[];
}

/**
 * Builds a retriever over one edition's entries. Everything is scoped to
 * `edition` even if the caller's list is mixed — a 2014 character must never be
 * answered with 2024 rules (see CLAUDE.md's edition separation).
 */
export function buildRulesIndex(entries: ContentEntry[], edition: Edition): RulesIndex {
  const pool = entries.filter((e) => e.edition === edition && RETRIEVABLE.has(e.kind));

  const byName = new Map<string, ContentEntry[]>();
  for (const entry of pool) {
    const key = entry.name.toLowerCase();
    const list = byName.get(key);
    if (list) list.push(entry);
    else byName.set(key, [entry]);
  }
  // Longest first, so "Greater Invisibility" claims its span before "Invisibility" can.
  const names = [...byName.keys()].filter((n) => n.length >= 3).sort((a, b) => b.length - a.length);

  /** Singular, lowercase word tokens; plurals fold so "rages" finds Rage. */
  const tokenize = (text: string) =>
    text
      .toLowerCase()
      .split(/[^a-z']+/)
      .map((w) => w.replace(/'s$/, '').replace(/(?<=[a-z]{3})s$/, ''))
      .filter((w) => w.length >= 3 && !STOPWORDS.has(w));
  const nameTokens = pool
    .map((entry) => ({ entry, tokens: tokenize(entry.name) }))
    .filter(({ entry, tokens }) => tokens.length > 0 && !COMMON_WORD_NAMES.has(entry.name.toLowerCase()));

  function pick(candidates: ContentEntry[], preferIds?: ReadonlySet<string>): ContentEntry {
    return [...candidates].sort((a, b) => {
      // Something the character actually has beats a same-named entry they don't.
      const owned = Number(preferIds?.has(b.id) ?? false) - Number(preferIds?.has(a.id) ?? false);
      if (owned !== 0) return owned;
      // A player's own homebrew is the version they mean.
      const custom = Number(b.origin === 'custom') - Number(a.origin === 'custom');
      if (custom !== 0) return custom;
      return (KIND_PRIORITY[a.kind] ?? 9) - (KIND_PRIORITY[b.kind] ?? 9);
    })[0];
  }

  return {
    retrieve(message, { preferIds, limit = MAX_RETRIEVED } = {}) {
      const found: ContentEntry[] = [];
      const seen = new Set<string>();
      const add = (entry: ContentEntry) => {
        if (found.length >= limit || seen.has(entry.id)) return;
        seen.add(entry.id);
        found.push(entry);
      };

      // 1. Name mentions. Matched spans are blanked out so a shorter name
      //    can't re-match inside a longer one already taken.
      let remaining = message;
      for (const name of names) {
        if (found.length >= limit) break;
        const candidates = byName.get(name)!;
        const caseInsensitive = !COMMON_WORD_NAMES.has(name);
        const match = new RegExp(`\\b${escapeRegExp(candidates[0].name)}\\b`, caseInsensitive ? 'i' : '').exec(remaining);
        if (!match) continue;
        add(pick(candidates, preferIds));
        remaining = remaining.slice(0, match.index) + ' '.repeat(match[0].length) + remaining.slice(match.index + match[0].length);
      }

      // 2. Every word of the name present, most specific names first.
      const words = new Set(tokenize(remaining));
      if (words.size > 0 && found.length < limit) {
        const matches = nameTokens
          .filter(({ tokens }) => tokens.every((t) => words.has(t)))
          .sort((a, b) => b.tokens.length - a.tokens.length);
        const groups = new Map<string, ContentEntry[]>();
        for (const { entry } of matches) {
          const key = entry.name.toLowerCase();
          groups.set(key, [...(groups.get(key) ?? []), entry]);
        }
        for (const candidates of groups.values()) add(pick(candidates, preferIds));
      }

      return found;
    },
  };
}

/** The one-line header for an entry in the prompt and the sources list. */
export function describeEntry(entry: ContentEntry): string {
  if (entry.kind === 'spell') {
    const d = entry.data;
    const level = d.level === 0 ? `${d.school} cantrip` : `level ${d.level} ${d.school}`;
    return `spell, ${level}`;
  }
  return entry.kind;
}

/** Entry text as the model sees it: header facts plus a capped description. */
export function entryPromptText(entry: ContentEntry): string {
  const lines: string[] = [];
  if (entry.kind === 'spell') {
    const d = entry.data;
    const comps = [d.components.verbal && 'V', d.components.somatic && 'S', d.components.material && `M (${d.components.material})`]
      .filter(Boolean)
      .join(', ');
    lines.push(
      `Casting time: ${d.castingTime}. Range: ${d.range}. Components: ${comps || 'none'}. Duration: ${d.concentration ? 'Concentration, ' : ''}${d.duration}.${d.ritual ? ' Ritual.' : ''}`,
    );
  }
  const description = 'description' in entry.data ? String(entry.data.description ?? '') : '';
  lines.push(description.length > MAX_DESCRIPTION_CHARS ? `${description.slice(0, MAX_DESCRIPTION_CHARS)}…` : description);
  return lines.filter(Boolean).join('\n');
}
