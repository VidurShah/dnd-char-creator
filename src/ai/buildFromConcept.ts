import type { Ability, Edition } from '@/schema/common';
import type { ContentEntry } from '@/schema/content';
import { ProposedConceptSchema, ResolvedDecisionsSchema, type ProposedConcept } from '@/schema/ai';
import { enumerateDecisions } from '@/engine/decisions';
import { computeSheet } from '@/engine/compute';
import { spellSelectionPlan } from '@/engine/spellcasting';
import { buildCharacter } from '@/features/characters/characterFactory';
import { emptyBuilderState, STANDARD_ARRAY, type BuilderState } from '@/features/characters/builder/builderState';
import { resolveItemRef } from '@/features/characters/builder/resolveItemRef';
import { buildCatalog } from './catalog';
import { callToolWithValidation } from './geminiClient';
import { PROPOSE_CONCEPT_TOOL, RESOLVE_DECISIONS_TOOL } from './tools';

function classShortId(ref: string): string {
  return ref.split('/').pop() ?? ref;
}

/** Assigns the standard array to abilities in the model's stated priority order — same convention the premade templates use. */
function abilitiesFromPriorities(priorities: Ability[]): Record<Ability, number> {
  const scores: Record<Ability, number> = { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 };
  priorities.forEach((ability, i) => {
    if (STANDARD_ARRAY[i] != null) scores[ability] = STANDARD_ARRAY[i];
  });
  return scores;
}

function validateConcept(input: unknown, entries: ContentEntry[]): { success: true; data: ProposedConcept } | { success: false; error: string } {
  const parsed = ProposedConceptSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') };
  const byId = new Map(entries.map((e) => [e.id, e]));
  const c = parsed.data;
  if (byId.get(c.speciesRef)?.kind !== 'species') return { success: false, error: `speciesRef "${c.speciesRef}" is not a valid species id from the catalog.` };
  const classEntry = byId.get(c.classRef);
  if (classEntry?.kind !== 'class') return { success: false, error: `classRef "${c.classRef}" is not a valid class id from the catalog.` };
  if (byId.get(c.backgroundRef)?.kind !== 'background') return { success: false, error: `backgroundRef "${c.backgroundRef}" is not a valid background id from the catalog.` };
  if (c.subclassRef) {
    const subclassEntry = byId.get(c.subclassRef);
    if (subclassEntry?.kind !== 'subclass' || subclassEntry.data.parentClassRef !== c.classRef) {
      return { success: false, error: `subclassRef "${c.subclassRef}" doesn't belong to classRef "${c.classRef}".` };
    }
  }
  if (new Set(c.abilityPriorities).size !== 6) return { success: false, error: 'abilityPriorities must list all 6 abilities exactly once each.' };
  return { success: true, data: c };
}

export interface BuildFromConceptResult {
  state: BuilderState;
  /** Anything the AI's answer couldn't use as-is (invalid ref, out-of-range pick) and had to be dropped — surfaced so the player knows to double-check that spot. */
  warnings: string[];
}

export async function buildCharacterFromConcept(params: {
  edition: Edition;
  userConcept: string;
  entries: ContentEntry[];
  index: Map<string, ContentEntry>;
  /** Optional override — omit to use the server-side GEMINI_API_KEY from .env via the local proxy. */
  apiKey?: string;
  model: string;
}): Promise<BuildFromConceptResult | { error: string }> {
  const { edition, userConcept, entries, index, apiKey, model } = params;
  const warnings: string[] = [];

  // --- Turn 1: propose a concept ---
  const catalog = buildCatalog(entries, edition);
  const conceptPrompt = [
    `You're helping a player build a Dungeons & Dragons (${edition === '2014' ? '2014 rules' : '2024 rules'}) character.`,
    `Their idea, in their own words: "${userConcept}"`,
    '',
    'Pick a species, class, subclass (if the class has one, otherwise omit it), background, and ability priority order that best fits their idea, using ONLY ids from this catalog:',
    '',
    catalog,
    '',
    'Also flesh out the character as a roleplaying persona: choose an alignment, and write personalityTraits, ideals, bonds, flaws, and a short backstory (notes) — a few vivid sentences each, in the character\'s own flavor, not blank.',
    'And in `rationale`, give one or two plain sentences for each of: abilities, species, class, subclass (if chosen), background, and personality — explaining WHY you made that choice for THIS character, addressed to the player (e.g. "Half-Orc gives you the Strength and toughness a frontline barbarian wants").',
  ].join('\n');

  const conceptResult = await callToolWithValidation(apiKey, model, conceptPrompt, PROPOSE_CONCEPT_TOOL, (input) => validateConcept(input, entries));
  if ('error' in conceptResult) return { error: conceptResult.error };
  const concept = conceptResult.data;

  // --- Build a provisional state from the concept (level is flavor only — every new character starts at level 1, same as the interactive builder; use Level Up afterward to reach a higher level) ---
  let state: BuilderState = {
    ...emptyBuilderState(),
    edition,
    name: concept.name,
    baseAbilities: abilitiesFromPriorities(concept.abilityPriorities),
    speciesRef: concept.speciesRef,
    classRef: concept.classRef,
    subclassRef: concept.subclassRef,
    backgroundRef: concept.backgroundRef,
    alignment: concept.alignment ?? '',
    personalityTraits: concept.personalityTraits ?? '',
    ideals: concept.ideals ?? '',
    bonds: concept.bonds ?? '',
    flaws: concept.flaws ?? '',
    notes: concept.notes ?? '',
    aiRationale: concept.rationale ? { ...concept.rationale } : {},
  };
  if (concept.level !== 1) {
    warnings.push(`You asked for level ${concept.level} — every new character starts at level 1 here; use "Level Up" on the sheet afterward to reach it.`);
  }

  const classEntry = index.get(concept.classRef);
  const classShort = classShortId(concept.classRef);
  const items = entries.filter((e) => e.kind === 'item');

  // --- What's left to decide: class skill choice (+ anything chained on it, like Expertise, resolves later during builder review), spells, equipment, feats ---
  const draft = buildCharacter(state, items, index);
  const decisions = enumerateDecisions(draft, index);
  const sheet = computeSheet(draft, index);

  const spellMeta = classEntry?.kind === 'class' ? classEntry.data.spellcasting : undefined;
  const spellPool = spellMeta ? entries.filter((e) => e.kind === 'spell' && e.data.classLists.includes(classShort) && e.data.level <= 1) : [];
  const cantrips = spellPool.filter((e) => e.kind === 'spell' && e.data.level === 0);
  const leveledSpells = spellPool.filter((e) => e.kind === 'spell' && e.data.level === 1);
  const spellPlan = spellSelectionPlan(classEntry, 1, spellMeta ? sheet.abilities[spellMeta.ability].mod : 0);
  const cantripCap = spellPlan.cantripsKnown;
  const leveledCap = spellPlan.leveledCount;

  const startingEquipment = classEntry?.kind === 'class' ? classEntry.data.startingEquipment : undefined;
  const feats = entries.filter((e): e is Extract<ContentEntry, { kind: 'feat' }> => e.kind === 'feat');

  if (decisions.length === 0 && cantripCap + leveledCap === 0 && !startingEquipment) {
    // Nothing left to ask the model about — land the state as-is.
    return { state, warnings };
  }

  // --- Turn 2: resolve whatever's left ---
  const decisionLines = decisions.map((d) => `- ${d.decisionId}: "${d.prompt}" — choose ${d.count} from [${(d.options ?? []).join(', ')}]`);
  const spellLines = [
    cantripCap > 0 ? `Cantrips (choose ${cantripCap}): ${cantrips.map((s) => `${s.id} (${s.name})`).join(', ')}` : undefined,
    leveledCap > 0 ? `1st-level spells (choose ${leveledCap}): ${leveledSpells.map((s) => `${s.id} (${s.name})`).join(', ')}` : undefined,
  ].filter((l): l is string => l != null);
  const equipmentLines = startingEquipment
    ? [
        `Fixed gear (always granted, don't pick): ${startingEquipment.fixed.map((ref) => resolveItemRef(items, ref)?.name ?? ref).join(', ') || '(none)'}`,
        ...startingEquipment.choices.map(
          (c, i) => `Equipment choice ${i} — "${c.prompt}": options are [${c.options.map((opt, oi) => `${oi}: ${opt.map((ref) => resolveItemRef(items, ref)?.name ?? ref).join(' + ')}`).join(' | ')}]`,
        ),
        `Or take ${startingEquipment.goldAlternative} gp instead of all class equipment (takeStartingGold: true) — background gear is granted either way.`,
      ]
    : [];
  const featLines = feats.length > 0 ? [`Optional feats available (featRefs, pick 0 or more that fit the concept — most characters won't take any at level 1): ${feats.map((f) => `${f.id} (${f.name})`).join(', ')}`] : [];

  const decisionsPrompt = [
    `Continuing the same character: ${concept.name}, a ${classEntry?.name ?? concept.classRef}.`,
    'Resolve every open choice below, using ONLY the exact ids/refs listed — never invent one. If a section is empty, leave its corresponding field empty.',
    '',
    '## Decisions', ...decisionLines,
    '', '## Spells', ...(spellLines.length > 0 ? spellLines : ['(not a spellcaster)']),
    '', '## Equipment', ...(equipmentLines.length > 0 ? equipmentLines : ['(no choices — nothing to pick)']),
    '', '## Feats', ...(featLines.length > 0 ? featLines : ['(none available)']),
    '',
    'Also fill `rationale` with one short sentence each (only for the sections that had something to choose) for: choices (skills/decisions), spells, equipment, and feats — explaining why, addressed to the player.',
  ].join('\n');

  const decisionsResult = await callToolWithValidation(apiKey, model, decisionsPrompt, RESOLVE_DECISIONS_TOOL, (input) => {
    const parsed = ResolvedDecisionsSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') };
    return { success: true, data: parsed.data };
  });

  if ('error' in decisionsResult) {
    warnings.push(`Couldn't resolve the remaining choices automatically (${decisionsResult.error}) — finish them in the builder below.`);
    return { state, warnings };
  }
  const resolved = decisionsResult.data;

  // --- Sanitize: drop anything that doesn't match a real option rather than trusting the model's picks blindly ---
  const answeredDecisions = decisions
    .map((d) => {
      const answer = resolved.decisions.find((a) => a.decisionId === d.decisionId);
      if (!answer) return undefined;
      const validChoices = answer.choice.filter((c) => (d.options ?? []).includes(c));
      if (validChoices.length !== answer.choice.length) warnings.push(`Some picks for "${d.prompt}" weren't valid options and were dropped.`);
      return validChoices.length > 0 ? { scope: d.scope, decision: { decisionId: d.decisionId, choice: validChoices.slice(0, d.count) } } : undefined;
    })
    .filter((d): d is NonNullable<typeof d> => d != null);
  // Species-scoped answers must land in speciesDecisions (not classDecisions) — the
  // builder reads them from there, so misrouting one leaves that species choice showing
  // as unanswered and blocks the species step.
  const speciesDecisions = answeredDecisions.filter((a) => a.scope === 'species').map((a) => a.decision);
  const classDecisions = answeredDecisions.filter((a) => a.scope !== 'species').map((a) => a.decision);

  const validSpellIds = new Set([...cantrips, ...leveledSpells].map((s) => s.id));
  const knownSpells = resolved.knownSpells.filter((ref) => {
    const ok = validSpellIds.has(ref);
    if (!ok) warnings.push(`Dropped an invalid spell pick: ${ref}`);
    return ok;
  });

  const validFeatIds = new Set(feats.map((f) => f.id));
  const featRefs = resolved.featRefs.filter((ref) => validFeatIds.has(ref));

  const equipmentChoicePicks = startingEquipment
    ? startingEquipment.choices.map((c, i) => {
        const pick = resolved.equipmentChoicePicks[i];
        return typeof pick === 'number' && pick >= 0 && pick < c.options.length ? pick : 0;
      })
    : [];

  state = {
    ...state,
    speciesDecisions,
    classDecisions,
    knownSpells,
    featRefs,
    equipmentChoicePicks,
    takeStartingGold: resolved.takeStartingGold,
    aiRationale: { ...state.aiRationale, ...(resolved.rationale ?? {}) },
  };

  return { state, warnings };
}
