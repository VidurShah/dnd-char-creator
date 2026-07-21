import type { Character } from '@/schema/character';
import type { ContentEntry } from '@/schema/content';
import type { Decision } from '@/schema/common';

export interface UnresolvedDecision {
  decisionId: string;
  prompt: string;
  count: number;
  options?: string[];
  scope: 'species' | 'background' | 'class' | 'feat';
}

function classShortId(ref: string): string {
  return ref.split('/').pop() ?? ref;
}

/** Levels at which Rogue/Bard pick 2 already-proficient skills to double (Expertise) — a real 5e rule with no other natural home in the data model, so it's hardcoded here alongside the equally-hardcoded skillChoice logic below. */
const EXPERTISE_LEVELS: Record<string, number[]> = { rogue: [1, 6], bard: [3] };

/** Level at which Fighter/Paladin/Ranger pick a Fighting Style — same rationale as EXPERTISE_LEVELS above. */
const FIGHTING_STYLE_LEVELS: Record<string, number> = { fighter: 1, paladin: 2, ranger: 2 };

/** The core 2014 Fighting Style list. Not every option maps to a static numeric bonus (see compute.ts) — Protection and Great Weapon Fighting are reactive/reroll mechanics offered here for flavor even though they aren't mechanically applied yet. */
export const FIGHTING_STYLES = ['Archery', 'Defense', 'Dueling', 'Great Weapon Fighting', 'Protection', 'Two-Weapon Fighting'];

/**
 * Every decision point the current build declares, resolved or not. Builder
 * and level-up UIs render whatever this — minus already-recorded decisions —
 * comes back with, so adding a decisionId to content data is enough to make
 * it show up in the UI generically.
 */
export function enumerateDecisions(character: Character, index: Map<string, ContentEntry>): UnresolvedDecision[] {
  const decisions: UnresolvedDecision[] = [];

  const speciesEntry = index.get(character.build.species.ref);
  if (speciesEntry?.kind === 'species') {
    for (const dp of speciesEntry.data.decisionPoints ?? []) decisions.push({ ...dp, scope: 'species' });
  }

  const backgroundEntry = index.get(character.build.background.ref);
  if (backgroundEntry?.kind === 'background') {
    for (const dp of backgroundEntry.data.decisionPoints ?? []) decisions.push({ ...dp, scope: 'background' });
  }

  for (const c of character.build.classes) {
    const classEntry = index.get(c.classRef);
    if (classEntry?.kind !== 'class') continue;
    const shortId = classShortId(c.classRef);

    if (classEntry.data.skillChoice) {
      decisions.push({
        decisionId: `${shortId}/skills`,
        prompt: `Choose ${classEntry.data.skillChoice.count} skills`,
        count: classEntry.data.skillChoice.count,
        options: classEntry.data.skillChoice.options,
        scope: 'class',
      });
    }
    for (const dp of classEntry.data.decisionPoints ?? []) decisions.push({ ...dp, scope: 'class' });

    const fightingStyleLevel = FIGHTING_STYLE_LEVELS[shortId];
    if (fightingStyleLevel != null && c.levels >= fightingStyleLevel) {
      decisions.push({
        decisionId: `${shortId}/fighting-style`,
        prompt: 'Choose a Fighting Style',
        count: 1,
        options: FIGHTING_STYLES,
        scope: 'class',
      });
    }

    for (const level of EXPERTISE_LEVELS[shortId] ?? []) {
      if (c.levels < level) continue;
      const proficientSkills = new Set<string>();
      const skillDecision = c.decisionsByLevel['1']?.find((d) => d.decisionId === `${shortId}/skills`);
      if (skillDecision && Array.isArray(skillDecision.choice)) for (const s of skillDecision.choice) proficientSkills.add(s);
      if (backgroundEntry?.kind === 'background') for (const s of backgroundEntry.data.skillProficiencies) proficientSkills.add(s);
      decisions.push({
        decisionId: `${shortId}/expertise-${level}`,
        prompt: "Choose 2 skills you're proficient in to gain Expertise (double proficiency bonus)",
        count: 2,
        options: [...proficientSkills],
        scope: 'class',
      });
    }
  }

  for (const f of character.build.feats) {
    const featEntry = index.get(f.ref);
    if (featEntry?.kind !== 'feat') continue;
    for (const dp of featEntry.data.decisionPoints ?? []) decisions.push({ ...dp, scope: 'feat' });
  }

  return decisions;
}

function recordedDecisions(character: Character): Decision[] {
  return [
    ...character.build.species.decisions,
    ...character.build.background.decisions,
    ...character.build.classes.flatMap((c) => Object.values(c.decisionsByLevel).flat()),
    ...character.build.feats.flatMap((f) => f.decisions),
  ];
}

/** The subset of enumerateDecisions() the character hasn't answered yet. */
export function unresolvedDecisions(character: Character, index: Map<string, ContentEntry>): UnresolvedDecision[] {
  const recordedIds = new Set(recordedDecisions(character).map((d) => d.decisionId));
  return enumerateDecisions(character, index).filter((d) => !recordedIds.has(d.decisionId));
}
