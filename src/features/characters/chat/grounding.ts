import type { Edition } from '@/schema/common';
import type { ContentEntry } from '@/schema/content';
import type { ChatMessage } from '@/ai/geminiClient';
import { describeEntry, entryPromptText, MAX_RETRIEVED, type RulesIndex } from '@/ai/rulesRetrieval';

/**
 * Grounds each advisor turn in the content index: retrieve the entries the
 * question is about, put their real text in the system prompt, and have the
 * model cite them as [R1], [R2]… so the answer is checkable against the
 * Library rather than confidently wrong.
 */

/** One entry the advisor consulted for a reply. */
export interface RuleSource {
  /** Citation number, stable for the whole conversation: [R3] means the same entry in every reply. */
  ref: number;
  id: string;
  name: string;
  /** Short label, e.g. "condition" or "spell, level 2 conjuration". */
  label: string;
}

/** A chat message plus, on model replies, what was consulted for it. */
export interface AdvisorMessage extends ChatMessage {
  sources?: RuleSource[];
}

/** Earlier entries carried into a follow-up, so "and at 5th level?" still has the text it's about. */
const MAX_CARRIED = 3;

/**
 * Picks the sources for the turn whose user message is last in `messages`.
 *
 * Refs are numbered across the conversation rather than per turn. Every turn
 * resends the whole history, and an earlier reply's "[R1]" has to keep meaning
 * the entry it meant when it was written — renumbering per turn would quietly
 * point old citations at new entries.
 */
export function groundTurn(
  messages: AdvisorMessage[],
  rules: RulesIndex,
  byId: Map<string, ContentEntry>,
  preferIds?: ReadonlySet<string>,
): { sources: RuleSource[]; entries: ContentEntry[] } {
  const question = messages[messages.length - 1];
  const registry = new Map<string, number>();
  for (const m of messages) for (const s of m.sources ?? []) registry.set(s.id, s.ref);
  let nextRef = Math.max(0, ...registry.values()) + 1;

  const entries = rules.retrieve(question.text, { preferIds });
  const previous = [...messages].reverse().find((m) => m.role === 'model' && m.sources?.length);
  for (const s of previous?.sources?.slice(0, MAX_CARRIED) ?? []) {
    const entry = byId.get(s.id);
    if (entry && !entries.some((e) => e.id === entry.id) && entries.length < MAX_RETRIEVED + MAX_CARRIED) {
      entries.push(entry);
    }
  }

  const sources = entries.map((entry) => {
    let ref = registry.get(entry.id);
    if (ref === undefined) {
      ref = nextRef++;
      registry.set(entry.id, ref);
    }
    return { ref, id: entry.id, name: entry.name, label: describeEntry(entry) };
  });
  return { sources, entries };
}

/** The system-prompt section carrying this turn's rules text. */
export function rulesPromptSection(edition: Edition, sources: RuleSource[], entries: ContentEntry[]): string {
  const rules = edition === '2014' ? '5e (2014)' : '5.5e (2024)';
  if (sources.length === 0) {
    return [
      '## Rules reference',
      '',
      `No entries in this game's ${rules} content library matched the player's question. If they are asking how a rule works, say in a few words that you are answering from general knowledge so they can double-check it, then answer. Do not write any [R…] citation markers.`,
    ].join('\n');
  }
  return [
    '## Rules reference',
    '',
    `These are the actual ${rules} texts, from this game's content library, for things the player's question mentions. They are authoritative: where they differ from what you remember, they win. When you rely on one, cite it by writing its marker right after the claim, like "your speed becomes 0 [R1]". Only cite markers listed here. If the answer turns on a rule that is not covered below, say you are going from general knowledge for that part.`,
    '',
    ...sources.flatMap((s, i) => [`[R${s.ref}] ${s.name} (${s.label})`, entryPromptText(entries[i]), '']),
  ].join('\n');
}

/** Matches a citation like [R1] or [R1, R3] in a reply. */
export const CITATION_RE = /\[R\d+(?:\s*,\s*R?\d+)*\]/g;

/** The ref numbers inside one citation token. */
export function citationRefs(token: string): number[] {
  return [...token.matchAll(/\d+/g)].map((m) => Number(m[0]));
}

/** Refs a reply actually cited, among those it was given. */
export function citedRefs(text: string, sources: RuleSource[]): Set<number> {
  const known = new Set(sources.map((s) => s.ref));
  const cited = new Set<number>();
  for (const token of text.match(CITATION_RE) ?? []) {
    for (const ref of citationRefs(token)) if (known.has(ref)) cited.add(ref);
  }
  return cited;
}
