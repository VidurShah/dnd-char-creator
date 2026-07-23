import type { Ability, Skill, Decision, DecisionPoint } from '@/schema/common';
import type { Character } from '@/schema/character';
import type { ContentEntry } from '@/schema/content';
import type { Effect } from '@/schema/effects';
import { evalExpr, type ExprContext } from './expr';
import { lookupSpecialRule, type SpecialRuleContext } from './special';
import { isSpellQuery } from './optionQuery';
import { exhaustionEffects2014 } from './editions/2014';
import { exhaustionEffects2024 } from './editions/2024';

export interface Provenance {
  label: string;
  amount: number;
}

export interface DerivedAbility {
  score: number;
  mod: number;
  sources: Provenance[];
}

export interface DerivedSave {
  mod: number;
  proficient: boolean;
}

export interface DerivedSkill {
  mod: number;
  proficient: boolean;
}

export interface AttackOption {
  itemRef: string;
  name: string;
  attackBonus: number;
  damageDice: string;
  damageBonus: number;
  damageType: string;
  /** 2024-only weapon mastery property name (e.g. "Vex") — display-only, see editions/2024.ts. */
  mastery?: string;
}

export interface ResourceState {
  id: string;
  label: string;
  /** One line explaining what the pool is spent on — shown in the UI so an unfamiliar resource name isn't a dead end. */
  description: string;
  max: number;
  recharge: 'short' | 'long' | 'none';
}

export interface DerivedSpellcasting {
  ability: Ability;
  saveDc: number;
  attackBonus: number;
  slots: number[]; // index 0 unused, 1..9
  cantripsKnown: number;
  /** Warlock Pact Magic — a separate pool from regular slots, recharges on a short rest. */
  pactSlots?: { level: number; count: number };
}

export type FeatureSource = 'species' | 'background' | 'class' | 'subclass' | 'feat';

export interface DerivedFeature {
  ref: string;
  name: string;
  description: string;
  source: FeatureSource;
}

export interface DerivedSense {
  sense: string;
  range: number;
}

export interface DerivedSheet {
  proficiencyBonus: number;
  totalLevel: number;
  abilities: Record<Ability, DerivedAbility>;
  savingThrows: Record<Ability, DerivedSave>;
  skills: Partial<Record<Skill, DerivedSkill>>;
  passivePerception: number;
  senses: DerivedSense[];
  resistances: string[];
  ac: { value: number; sources: Provenance[] };
  speed: number;
  initiative: number;
  hp: { max: number };
  attacks: AttackOption[];
  spellcasting?: DerivedSpellcasting;
  resources: ResourceState[];
  features: DerivedFeature[];
  /** Domain/oath/expanded-list spells granted by a subclass, plus any `grantSpell` effect (racial/feat innate spells) — always prepared, not counted against the known-spell cap. */
  grantedSpellRefs: string[];
  /** Rogue/Arcane Trickster/Assassin — bonus damage dice, once per turn on a hit with a finesse/ranged weapon. Not baked into `attacks[].damageDice` since it's conditional, not automatic. */
  sneakAttackDice?: string;
  /** 2014-only: exhaustion's disadvantage tiers aren't flat modifiers, so they're surfaced as flags for the UI to apply when rolling (2024 uses a flat d20Penalty, already folded into the mods above instead). */
  exhaustionDisadvantage: { abilityChecks: boolean; attacksAndSaves: boolean };
  /** Sum of every carried item's weight × qty (inline items with no weight recorded contribute 0). */
  carriedWeight: number;
  /** Core PHB rule: Strength score × 15 lb. */
  carryingCapacity: number;
  /** Non-walking movement modes granted by a `speed` effect (fly/swim/climb) — walk speed stays in `speed` above. */
  movementModes: { mode: 'fly' | 'swim' | 'climb'; value: number }[];
  /** Tool/weapon/armor proficiencies — from class/background data plus any `proficiency` effects. */
  proficiencies: { tools: string[]; weapons: string[]; armor: string[] };
}

function abilityMod(score: number): number {
  return Math.floor((score - 10) / 2);
}

function classShortId(ref: string): string {
  return ref.split('/').pop() ?? ref;
}

function asClassEntry(entry: ContentEntry | undefined) {
  return entry?.kind === 'class' ? entry : undefined;
}

function asSubclassEntry(entry: ContentEntry | undefined) {
  return entry?.kind === 'subclass' ? entry : undefined;
}

function asSpeciesEntry(entry: ContentEntry | undefined) {
  return entry?.kind === 'species' ? entry : undefined;
}

function asBackgroundEntry(entry: ContentEntry | undefined) {
  return entry?.kind === 'background' ? entry : undefined;
}

function asFeatEntry(entry: ContentEntry | undefined) {
  return entry?.kind === 'feat' ? entry : undefined;
}

function asItemEntry(entry: ContentEntry | undefined) {
  return entry?.kind === 'item' ? entry : undefined;
}

function asFeatureEntry(entry: ContentEntry | undefined) {
  return entry?.kind === 'feature' ? entry : undefined;
}

const ABILITIES: Ability[] = ['str', 'dex', 'con', 'int', 'wis', 'cha'];

/**
 * Recomputes a character's full sheet from its recorded build decisions and
 * play-time state. Pure and deterministic: the same character + content index
 * always yields the same sheet, so the sheet itself is never stored.
 */
export function computeSheet(character: Character, index: Map<string, ContentEntry>): DerivedSheet {
  const classBlocks = character.build.classes.map((c) => ({
    ref: c.classRef,
    shortId: classShortId(c.classRef),
    entry: asClassEntry(index.get(c.classRef)),
    subclassEntry: c.subclassRef ? asSubclassEntry(index.get(c.subclassRef)) : undefined,
    levels: c.levels,
    decisionsByLevel: c.decisionsByLevel,
  }));

  const totalLevel = classBlocks.reduce((sum, c) => sum + c.levels, 0);
  const proficiencyBonus = 2 + Math.floor((totalLevel - 1) / 4);
  const classLevels: Record<string, number> = {};
  for (const c of classBlocks) classLevels[c.shortId] = c.levels;

  // Fighting Style — recorded via the `${class}/fighting-style` decision (see decisions.ts).
  // Only the options that map to a static numeric bonus are applied here; Protection and Great
  // Weapon Fighting are reactive/reroll mechanics with no natural home in a derived-sheet number.
  const fightingStyleDecision = classBlocks
    .flatMap((c) => Object.values(c.decisionsByLevel).flat())
    .find((d) => d.decisionId.endsWith('/fighting-style'));
  const fightingStyle = Array.isArray(fightingStyleDecision?.choice) ? fightingStyleDecision.choice[0] : undefined;

  // --- Exhaustion: 2014's tiered table (disadvantage flags + speed/HP multipliers)
  // vs. 2024's flat -2/level d20 penalty + flat speed reduction. See src/engine/editions/.
  const exhaustionLevel = character.state.exhaustion;
  const exhaustion2014 = character.edition === '2014' ? exhaustionEffects2014(exhaustionLevel) : undefined;
  const exhaustion2024 = character.edition === '2024' ? exhaustionEffects2024(exhaustionLevel) : undefined;
  const exhaustionD20Penalty = exhaustion2024?.d20Penalty ?? 0;
  const exhaustionDisadvantage = {
    abilityChecks: exhaustion2014?.abilityCheckDisadvantage ?? false,
    attacksAndSaves: exhaustion2014?.attackAndSaveDisadvantage ?? false,
  };

  const speciesEntry = asSpeciesEntry(index.get(character.build.species.ref));
  const backgroundEntry = asBackgroundEntry(index.get(character.build.background.ref));
  const backgroundFeatureEntry = backgroundEntry?.data.featureRef ? asFeatureEntry(index.get(backgroundEntry.data.featureRef)) : undefined;
  // 2024 backgrounds grant a starting Origin feat automatically, in addition to any explicitly chosen feats.
  const grantedFeatEntry = backgroundEntry?.data.grantedFeatRef ? asFeatEntry(index.get(backgroundEntry.data.grantedFeatRef)) : undefined;
  const chosenFeatEntries = character.build.feats.map((f) => asFeatEntry(index.get(f.ref))).filter((e) => e != null);
  const featEntries = grantedFeatEntry ? [grantedFeatEntry, ...chosenFeatEntries] : chosenFeatEntries;

  // --- Active feature refs — computed early so their `effects` (if any) can feed the
  // ability/proficiency/etc. calculations below, not just the AC specialRules pass. ---
  const classFeatureRefs = new Set<string>();
  const subclassFeatureRefs = new Set<string>();
  for (const c of classBlocks) {
    for (const lvl of c.entry?.data.levels ?? []) {
      if (lvl.level <= c.levels) for (const ref of lvl.featureRefs) classFeatureRefs.add(ref);
    }
    if (c.subclassEntry) {
      for (const [levelStr, refs] of Object.entries(c.subclassEntry.data.featuresByLevel)) {
        if (Number(levelStr) <= c.levels) for (const ref of refs) subclassFeatureRefs.add(ref);
      }
    }
  }
  const activeFeatureEntries = [...classFeatureRefs, ...subclassFeatureRefs]
    .map((ref) => asFeatureEntry(index.get(ref)))
    .filter((e): e is NonNullable<typeof e> => e != null);
  if (backgroundFeatureEntry) activeFeatureEntries.push(backgroundFeatureEntry);

  // --- Equipment resolution (needed before abilities, since a magic item could grant a bonus) ---
  const activeEquipment = character.state.inventory
    .filter((i) => i.equipped && i.itemRef)
    .map((i) => ({ inv: i, item: asItemEntry(index.get(i.itemRef!)) }))
    .filter((x): x is { inv: (typeof character.state.inventory)[number]; item: NonNullable<typeof x.item> } => x.item != null);
  const equippedItems = activeEquipment.map((x) => x.item);
  // Attunement-gated items only contribute their effects while actually attuned.
  const activeItemSources = activeEquipment.filter((x) => x.item.data.attunement === false || x.inv.attuned);

  // --- Carried weight: every inventory item (not just equipped), inline items contribute 0 ---
  const carriedWeight = character.state.inventory.reduce((sum, i) => {
    const item = i.itemRef ? asItemEntry(index.get(i.itemRef)) : undefined;
    return sum + (item?.data.weight ?? 0) * i.qty;
  }, 0);

  // --- Abilities: base scores + abilityBonus effects (species, feats, magic items, active features) -----
  const abilitySources: Record<Ability, Provenance[]> = { str: [], dex: [], con: [], int: [], wis: [], cha: [] };
  for (const ability of ABILITIES) {
    abilitySources[ability].push({ label: 'Base score', amount: character.build.baseAbilities[ability] });
  }

  const baseExprCtx: ExprContext = {
    prof: proficiencyBonus,
    totalLevel,
    classLevels,
    abilityMods: mapAbilityMods(character.build.baseAbilities),
  };
  applyAbilityBonusEffects(speciesEntry?.effects ?? [], speciesEntry?.name ?? 'Species', abilitySources, baseExprCtx);
  for (const feat of featEntries) applyAbilityBonusEffects(feat.effects ?? [], feat.name, abilitySources, baseExprCtx);
  for (const x of activeItemSources) applyAbilityBonusEffects(x.item.effects ?? [], x.item.name, abilitySources, baseExprCtx);
  for (const feature of activeFeatureEntries) applyAbilityBonusEffects(feature.effects ?? [], feature.name, abilitySources, baseExprCtx);

  // 2024-only: background ability score allocation (+2/+1 or +1/+1/+1 across the background's
  // 3 listed abilities) replaces the species ability bonuses of 2014. Recorded as a decision
  // with choice entries shaped "ability:amount", e.g. ["wis:2", "int:1"].
  for (const asi of character.build.abilityImprovements ?? []) {
    for (const [ability, amount] of Object.entries(asi.abilities)) {
      abilitySources[ability as Ability].push({ label: `Ability Score Improvement (Lvl ${asi.level})`, amount });
    }
  }

  // Species choice decisions that raise abilities (Variant Human's two +1s, Half-Elf's
  // two non-Cha +1s, etc.): any recorded species-decision choice value that is an ability
  // key grants +1 to that ability. (Spell/skill/tool picks fall through — handled elsewhere.)
  for (const d of character.build.species.decisions) {
    if (!Array.isArray(d.choice)) continue;
    for (const value of d.choice) {
      if ((ABILITIES as readonly string[]).includes(value)) {
        abilitySources[value as Ability].push({ label: `${speciesEntry?.name ?? 'Species'} (choice)`, amount: 1 });
      }
    }
  }

  if (backgroundEntry?.data.abilityScoreOptions) {
    const allocation = character.build.background.decisions.find((d) => d.decisionId === 'background/ability-scores');
    if (Array.isArray(allocation?.choice)) {
      for (const entry of allocation.choice) {
        const [ability, amountStr] = entry.split(':');
        if (backgroundEntry.data.abilityScoreOptions.includes(ability as Ability)) {
          abilitySources[ability as Ability].push({ label: `Background: ${backgroundEntry.name}`, amount: Number(amountStr) || 0 });
        }
      }
    }
  }

  // abilityMax: default cap is 20; an `abilityMax` effect can raise it for a specific ability
  // (e.g. a feat letting Strength exceed 20). Multiple sources take the highest cap offered.
  const abilityMaxes: Record<Ability, number> = { str: 20, dex: 20, con: 20, int: 20, wis: 20, cha: 20 };
  const abilityMaxEffectSources = [
    speciesEntry?.effects ?? [],
    ...featEntries.map((f) => f.effects ?? []),
    ...activeItemSources.map((x) => x.item.effects ?? []),
    ...activeFeatureEntries.map((f) => f.effects ?? []),
  ];
  for (const effects of abilityMaxEffectSources) {
    for (const effect of effects) {
      if (effect.op === 'abilityMax') abilityMaxes[effect.ability] = Math.max(abilityMaxes[effect.ability], effect.max);
    }
  }

  const abilities: Record<Ability, DerivedAbility> = {} as Record<Ability, DerivedAbility>;
  for (const ability of ABILITIES) {
    const rawScore = abilitySources[ability].reduce((sum, s) => sum + s.amount, 0);
    const score = Math.min(rawScore, abilityMaxes[ability]);
    abilities[ability] = { score, mod: abilityMod(score), sources: abilitySources[ability] };
  }
  const abilityMods = Object.fromEntries(ABILITIES.map((a) => [a, abilities[a].mod])) as Record<Ability, number>;
  const dexMod = abilityMods.dex;

  // --- Non-ability effects from species/feats/active items/active features (resistance, roll
  // bonuses, AC bonus, proficiency, expertise, resource, sense, speed, grantSpell, spellcasting) ---
  const passiveEffects: { effect: Effect; label: string }[] = [];
  for (const effect of speciesEntry?.effects ?? []) passiveEffects.push({ effect, label: speciesEntry?.name ?? 'Species' });
  for (const feat of featEntries) for (const effect of feat.effects ?? []) passiveEffects.push({ effect, label: feat.name });
  for (const x of activeItemSources) for (const effect of x.item.effects ?? []) passiveEffects.push({ effect, label: x.item.name });
  for (const feature of activeFeatureEntries) for (const effect of feature.effects ?? []) passiveEffects.push({ effect, label: feature.name });

  const resistances = [...new Set(passiveEffects.filter((p) => p.effect.op === 'resistance').flatMap((p) => (p.effect as Extract<Effect, { op: 'resistance' }>).damageTypes))];
  const saveBonusEffects = passiveEffects.filter((p) => p.effect.op === 'rollBonus' && p.effect.on.includes('savingThrow'));
  const attackBonusEffects = passiveEffects.filter((p) => p.effect.op === 'rollBonus' && p.effect.on.includes('attack'));
  const initiativeBonusEffects = passiveEffects.filter((p) => p.effect.op === 'rollBonus' && p.effect.on.includes('initiative'));
  // Equivalent in effect (rollBonus has no per-skill scoping field) — summed
  // together into DerivedSkill.mod below. See RollTagSchema for why both exist.
  const abilityCheckBonusEffects = passiveEffects.filter((p) => p.effect.op === 'rollBonus' && p.effect.on.includes('abilityCheck'));
  const skillCheckBonusEffects = passiveEffects.filter((p) => p.effect.op === 'rollBonus' && p.effect.on.includes('skillCheck'));
  const acBonusEffects = passiveEffects.filter((p) => p.effect.op === 'acBonus');
  const acFormulaEffects = passiveEffects.filter((p): p is { effect: Extract<Effect, { op: 'acFormula' }>; label: string } => p.effect.op === 'acFormula');
  const proficiencyEffects = passiveEffects.filter((p): p is { effect: Extract<Effect, { op: 'proficiency' }>; label: string } => p.effect.op === 'proficiency');
  const expertiseEffects = passiveEffects.filter((p): p is { effect: Extract<Effect, { op: 'expertise' }>; label: string } => p.effect.op === 'expertise');
  const resourceEffects = passiveEffects.filter((p): p is { effect: Extract<Effect, { op: 'resource' }>; label: string } => p.effect.op === 'resource');
  const speedEffects = passiveEffects.filter((p): p is { effect: Extract<Effect, { op: 'speed' }>; label: string } => p.effect.op === 'speed');
  const grantSpellEffects = passiveEffects.filter((p): p is { effect: Extract<Effect, { op: 'grantSpell' }>; label: string } => p.effect.op === 'grantSpell');
  const spellcastingEffects = passiveEffects.filter((p): p is { effect: Extract<Effect, { op: 'spellcasting' }>; label: string } => p.effect.op === 'spellcasting');

  // --- Saving throws: single-class MVP — first class taken grants save proficiency, plus any `proficiency` effect ---
  const saveProfs = new Set<Ability>(classBlocks[0]?.entry?.data.savingThrowProficiencies ?? []);
  for (const p of proficiencyEffects) if (p.effect.domain === 'save') for (const key of p.effect.keys) saveProfs.add(key as Ability);
  const saveBonus = saveBonusEffects.reduce((sum, p) => sum + evalExpr((p.effect as Extract<Effect, { op: 'rollBonus' }>).amount, baseExprCtx), 0);
  const initiativeBonus = initiativeBonusEffects.reduce((sum, p) => sum + evalExpr((p.effect as Extract<Effect, { op: 'rollBonus' }>).amount, baseExprCtx), 0);
  const savingThrows: Record<Ability, DerivedSave> = {} as Record<Ability, DerivedSave>;
  for (const ability of ABILITIES) {
    const proficient = saveProfs.has(ability);
    savingThrows[ability] = { mod: abilityMods[ability] + (proficient ? proficiencyBonus : 0) + saveBonus + exhaustionD20Penalty, proficient };
  }

  // --- Skills: class skill choice decision + background grants + any `proficiency` effect ---
  const proficientSkills = new Set<Skill>();
  for (const c of classBlocks) {
    const decision = c.decisionsByLevel['1']?.find((d) => d.decisionId === `${c.shortId}/skills`);
    if (decision && Array.isArray(decision.choice)) {
      for (const skill of decision.choice) proficientSkills.add(skill as Skill);
    }
  }
  if (backgroundEntry) {
    for (const skill of backgroundEntry.data.skillProficiencies) proficientSkills.add(skill as Skill);
  }
  for (const p of proficiencyEffects) if (p.effect.domain === 'skill') for (const key of p.effect.keys) proficientSkills.add(key as Skill);
  // Species skill-choice decisions (Half-Elf Skill Versatility, Variant Human skill, etc.):
  // any chosen value that names a real skill becomes a proficiency.
  for (const d of character.build.species.decisions) {
    if (!Array.isArray(d.choice)) continue;
    for (const value of d.choice) if (value in SKILL_ABILITY) proficientSkills.add(value as Skill);
  }

  // Expertise doubles proficiency bonus on the listed skills — either a static `expertise`
  // effect, or (Rogue/Bard) the character's own choice of which already-proficient skills to
  // double, recorded via the `${class}/expertise-N` decision (see decisions.ts).
  const expertiseSkills = new Set<Skill>();
  for (const p of expertiseEffects) for (const skill of p.effect.skills) expertiseSkills.add(skill as Skill);
  for (const c of classBlocks) {
    for (const decisions of Object.values(c.decisionsByLevel)) {
      for (const d of decisions) {
        if (d.decisionId.startsWith(`${c.shortId}/expertise-`) && Array.isArray(d.choice)) {
          for (const skill of d.choice) expertiseSkills.add(skill as Skill);
        }
      }
    }
  }

  const checkBonus = [...abilityCheckBonusEffects, ...skillCheckBonusEffects].reduce(
    (sum, p) => sum + evalExpr((p.effect as Extract<Effect, { op: 'rollBonus' }>).amount, baseExprCtx),
    0,
  );
  const skills: Partial<Record<Skill, DerivedSkill>> = {};
  for (const skill of proficientSkills) {
    const ability = SKILL_ABILITY[skill];
    const expertiseBonus = expertiseSkills.has(skill) ? proficiencyBonus : 0;
    skills[skill] = { mod: abilityMods[ability] + proficiencyBonus + expertiseBonus + checkBonus + exhaustionD20Penalty, proficient: true };
  }
  const passivePerception = 10 + (skills.perception?.mod ?? abilityMods.wis);

  // --- Tool/weapon/armor proficiencies: class + background static lists, plus any `proficiency` effect ---
  const toolProficiencies = new Set<string>([...(classBlocks[0]?.entry?.data.toolProficiencies ?? []), ...(backgroundEntry?.data.toolProficiencies ?? [])]);
  const weaponProficiencies = new Set<string>(classBlocks[0]?.entry?.data.weaponProficiencies ?? []);
  const armorProficiencies = new Set<string>(classBlocks[0]?.entry?.data.armorProficiencies ?? []);
  for (const p of proficiencyEffects) {
    if (p.effect.domain === 'tool') for (const key of p.effect.keys) toolProficiencies.add(key);
    if (p.effect.domain === 'weapon') for (const key of p.effect.keys) weaponProficiencies.add(key);
    if (p.effect.domain === 'armor') for (const key of p.effect.keys) armorProficiencies.add(key);
  }
  // Species tool-choice decisions (Dwarf's artisan's tool pick): a decision id mentioning
  // "tool" contributes its chosen values as tool proficiencies.
  for (const d of character.build.species.decisions) {
    if (d.decisionId.includes('tool') && Array.isArray(d.choice)) for (const value of d.choice) toolProficiencies.add(value);
  }

  // --- Senses: darkvision heuristic (until every species carries a proper `sense` effect) + generic consumption ---
  const senseRanges = new Map<string, number>();
  if ((speciesEntry?.data.traits ?? []).some((ref) => ref.includes('darkvision'))) senseRanges.set('darkvision', 60);
  for (const p of passiveEffects) {
    if (p.effect.op === 'sense') senseRanges.set(p.effect.sense, Math.max(senseRanges.get(p.effect.sense) ?? 0, p.effect.range));
  }
  const senses: DerivedSense[] = [...senseRanges.entries()].map(([sense, range]) => ({ sense, range }));

  // --- Equipment: AC, attacks ---
  const equippedArmor = equippedItems.find((i) => i.data.category === 'armor');
  const equippedShield = equippedItems.find((i) => i.data.category === 'shield');

  const acCandidates: (Provenance & { allowShield?: boolean })[] = [{ label: 'Unarmored (10 + Dex)', amount: 10 + dexMod }];
  if (equippedArmor?.data.armor) {
    const armor = equippedArmor.data.armor;
    const dexContribution = armor.addDexMod ? Math.min(dexMod, armor.maxDexBonus ?? Infinity) : 0;
    // Defense fighting style: +1 AC while wearing armor.
    const defenseBonus = fightingStyle === 'Defense' ? 1 : 0;
    acCandidates.push({ label: equippedArmor.name, amount: armor.baseAc + dexContribution + defenseBonus });
  }
  for (const p of acFormulaEffects) {
    const addMods = p.effect.addMods.reduce((sum, a) => sum + abilityMods[a], 0);
    acCandidates.push({ label: p.label, amount: p.effect.base + addMods, allowShield: p.effect.allowShield });
  }

  // --- Active feature refs already computed above — run specialRules against them for AC etc. ---
  const ruleCtx: SpecialRuleContext = {
    abilityMods,
    prof: proficiencyBonus,
    isWearingArmor: equippedArmor != null,
    isWearingShield: equippedShield != null,
    classLevels,
  };
  for (const ref of [...classFeatureRefs, ...subclassFeatureRefs]) {
    const contribution = lookupSpecialRule(ref)?.(ruleCtx);
    if (contribution?.acCandidate) {
      acCandidates.push({ label: contribution.acCandidate.label, amount: contribution.acCandidate.value });
    }
  }

  const bestAc = acCandidates.reduce((best, c) => (c.amount > best.amount ? c : best), acCandidates[0]);
  // A shield can't be added on top of an acFormula candidate that explicitly disallows one (e.g. certain Unarmored Defense variants).
  const shieldAllowed = bestAc.allowShield !== false;
  const shieldBonus = equippedShield && shieldAllowed ? 2 : 0;
  const acBonusSources = acBonusEffects.map((p) => ({ label: p.label, amount: evalExpr((p.effect as Extract<Effect, { op: 'acBonus' }>).amount, baseExprCtx) }));
  const acItemBonus = acBonusSources.reduce((sum, s) => sum + s.amount, 0);
  const acSources = [bestAc, ...(shieldBonus ? [{ label: equippedShield!.name, amount: shieldBonus }] : []), ...acBonusSources];
  const ac = { value: bestAc.amount + shieldBonus + acItemBonus, sources: acSources };

  const attackBonus = attackBonusEffects.reduce((sum, p) => sum + evalExpr((p.effect as Extract<Effect, { op: 'rollBonus' }>).amount, baseExprCtx), 0);

  // A class's own level-table columns (e.g. Barbarian's rage_damage_bonus, Rogue's
  // sneak_attack_dice_*, Monk's martial_arts_dice_*) aren't `resource` effects — they're
  // always-available numeric modifiers, so they're read straight off the level row here.
  function classColumn(shortId: string, key: string): number {
    const c = classBlocks.find((cb) => cb.shortId === shortId);
    const levelRow = c?.entry?.data.levels.find((l) => l.level === c.levels);
    const value = levelRow?.columns?.[key];
    return typeof value === 'number' ? value : 0;
  }

  const rageDamageBonus = classColumn('barbarian', 'rage_damage_bonus');
  const isRaging = character.state.raging === true && rageDamageBonus > 0;
  const equippedWeaponCount = equippedItems.filter((i) => i.data.weapon).length;

  const attacks: AttackOption[] = equippedItems
    .filter((i) => i.data.weapon)
    .map((i) => {
      const weapon = i.data.weapon!;
      const isFinesse = weapon.properties.includes('finesse');
      // Only true ranged weapons (bows, crossbows, slings) force Dex — thrown weapons use the
      // same ability they'd use in melee (Str, or Dex if finesse), per the 5e thrown-weapon rule.
      const isRanged = weapon.properties.includes('ammunition');
      const abilityForAttack: Ability = isRanged ? 'dex' : isFinesse ? (dexMod > abilityMods.str ? 'dex' : 'str') : 'str';
      const mod = abilityMods[abilityForAttack];
      // Rage's damage bonus only applies to Strength-based melee attacks (PHB p.49).
      const rageBonus = isRaging && abilityForAttack === 'str' && !isRanged ? rageDamageBonus : 0;
      const archeryBonus = fightingStyle === 'Archery' && isRanged ? 2 : 0;
      const isOneHandedMelee = !isRanged && !weapon.properties.includes('two-handed');
      const duelingBonus = fightingStyle === 'Dueling' && isOneHandedMelee && equippedWeaponCount === 1 ? 2 : 0;
      return {
        itemRef: i.id,
        name: i.name,
        attackBonus: proficiencyBonus + mod + attackBonus + archeryBonus + exhaustionD20Penalty,
        damageDice: weapon.damageDice,
        damageBonus: mod + rageBonus + duelingBonus,
        damageType: weapon.damageType,
        mastery: weapon.mastery,
      };
    });

  // Monks always have an Unarmed Strike option, even with no weapon equipped — Martial Arts
  // lets them use Dex in place of Str, and use their martial arts die instead of 1d4.
  const monkDiceCount = classColumn('monk', 'martial_arts_dice_count');
  const monkDiceValue = classColumn('monk', 'martial_arts_dice_value');
  if ((classLevels.monk ?? 0) > 0) {
    const abilityForAttack: Ability = dexMod > abilityMods.str ? 'dex' : 'str';
    const mod = abilityMods[abilityForAttack];
    const rageBonus = isRaging && abilityForAttack === 'str' ? rageDamageBonus : 0;
    attacks.push({
      itemRef: 'unarmed-strike',
      name: 'Unarmed Strike',
      attackBonus: proficiencyBonus + mod + attackBonus + exhaustionD20Penalty,
      damageDice: monkDiceCount > 0 ? `${monkDiceCount}d${monkDiceValue}` : '1d4',
      damageBonus: mod + rageBonus,
      damageType: 'bludgeoning',
    });
  }

  const sneakAttackCount = classColumn('rogue', 'sneak_attack_dice_count');
  const sneakAttackValue = classColumn('rogue', 'sneak_attack_dice_value');
  const sneakAttackDice = sneakAttackCount > 0 ? `${sneakAttackCount}d${sneakAttackValue}` : undefined;

  // --- Spellcasting: a single caster uses its own accurate per-level slot table; two or
  // more non-pact casters combine via the standard multiclass caster-level formula (PHB
  // p.164) instead, since that's the only RAW-correct way to pool differing progressions.
  // Pact Magic (warlock) never joins that shared pool — it's tracked as its own resource.
  const casterBlocks = classBlocks.filter((c) => c.entry?.data.spellcasting);
  const nonPactCasters = casterBlocks.filter((c) => c.entry!.data.spellcasting!.progression !== 'pact');
  const pactCaster = casterBlocks.find((c) => c.entry!.data.spellcasting!.progression === 'pact');

  let spellcasting: DerivedSpellcasting | undefined;
  if (nonPactCasters.length === 1) {
    const c = nonPactCasters[0];
    const meta = c.entry!.data.spellcasting!;
    const levelRow = c.entry!.data.levels.find((l) => l.level === c.levels);
    const spellMod = abilityMods[meta.ability];
    spellcasting = {
      ability: meta.ability,
      saveDc: 8 + proficiencyBonus + spellMod,
      attackBonus: proficiencyBonus + spellMod + exhaustionD20Penalty,
      slots: extractSlots(levelRow?.columns),
      cantripsKnown: extractCantrips(levelRow?.columns),
    };
  } else if (nonPactCasters.length > 1) {
    const combinedLevel = nonPactCasters.reduce((sum, c) => {
      const divisor = c.entry!.data.spellcasting!.progression === 'full' ? 1 : c.entry!.data.spellcasting!.progression === 'half' ? 2 : 3;
      return sum + Math.floor(c.levels / divisor);
    }, 0);
    const cantripsKnown = nonPactCasters.reduce((sum, c) => {
      const levelRow = c.entry!.data.levels.find((l) => l.level === c.levels);
      return sum + extractCantrips(levelRow?.columns);
    }, 0);
    // Simplification: DC/attack use the first spellcasting class's ability — a character
    // whose multiclassed casting abilities differ would really have two separate DCs.
    const primaryMeta = nonPactCasters[0].entry!.data.spellcasting!;
    const spellMod = abilityMods[primaryMeta.ability];
    spellcasting = {
      ability: primaryMeta.ability,
      saveDc: 8 + proficiencyBonus + spellMod,
      attackBonus: proficiencyBonus + spellMod + exhaustionD20Penalty,
      slots: MULTICLASS_SLOT_TABLE[Math.min(20, Math.max(0, combinedLevel))] ?? new Array(10).fill(0),
      cantripsKnown,
    };
  }

  if (pactCaster) {
    const meta = pactCaster.entry!.data.spellcasting!;
    const levelRow = pactCaster.entry!.data.levels.find((l) => l.level === pactCaster.levels);
    const rawSlots = extractSlots(levelRow?.columns);
    let pactLevel = 0;
    let pactCount = 0;
    for (let lvl = 1; lvl <= 9; lvl++) if (rawSlots[lvl] > 0) ({ level: pactLevel, count: pactCount } = { level: lvl, count: rawSlots[lvl] });
    const pactSlots = pactCount > 0 ? { level: pactLevel, count: pactCount } : undefined;

    if (spellcasting) {
      spellcasting.pactSlots = pactSlots;
    } else {
      const spellMod = abilityMods[meta.ability];
      spellcasting = {
        ability: meta.ability,
        saveDc: 8 + proficiencyBonus + spellMod,
        attackBonus: proficiencyBonus + spellMod + exhaustionD20Penalty,
        slots: new Array(10).fill(0),
        cantripsKnown: extractCantrips(levelRow?.columns),
        pactSlots,
      };
    }
  }

  // A `spellcasting` effect (e.g. a species granting innate spellcasting) only matters for
  // computing a DC/attack bonus when there's no class-based caster already providing one —
  // it never grants its own slot progression, just the ability score to cast grantSpell entries with.
  if (!spellcasting && spellcastingEffects.length > 0) {
    const meta = spellcastingEffects[0].effect;
    const spellMod = abilityMods[meta.ability];
    spellcasting = {
      ability: meta.ability,
      saveDc: 8 + proficiencyBonus + spellMod,
      attackBonus: proficiencyBonus + spellMod + exhaustionD20Penalty,
      slots: new Array(10).fill(0),
      cantripsKnown: 0,
    };
  }

  // --- Granted spells: domain/oath/expanded-list spells from a subclass, plus any `grantSpell`
  // effect (racial/feat innate spells) once the character's total level meets its minLevel. ---
  const grantedSpellRefs: string[] = [];
  for (const c of classBlocks) {
    for (const [levelStr, refs] of Object.entries(c.subclassEntry?.data.grantedSpellsByLevel ?? {})) {
      if (Number(levelStr) <= c.levels) grantedSpellRefs.push(...refs);
    }
  }
  for (const p of grantSpellEffects) {
    if (totalLevel >= (p.effect.minLevel ?? 1)) grantedSpellRefs.push(p.effect.spellRef);
  }
  // Spells picked via a spell-query decision (e.g. High Elf's bonus wizard cantrip)
  // count as always-available granted spells, not against the class known-spell cap.
  const pushChosenSpells = (decisionPoints: DecisionPoint[] | undefined, recorded: Decision[]) => {
    for (const dp of decisionPoints ?? []) {
      if (!isSpellQuery(dp.optionQuery)) continue;
      const answer = recorded.find((d) => d.decisionId === dp.decisionId);
      if (answer && Array.isArray(answer.choice)) grantedSpellRefs.push(...answer.choice);
    }
  };
  pushChosenSpells(speciesEntry?.data.decisionPoints, character.build.species.decisions);
  for (const c of classBlocks) {
    if (!c.subclassEntry) continue;
    const recorded = Object.values(character.build.classes.find((cl) => cl.classRef === c.ref)?.decisionsByLevel ?? {}).flat();
    pushChosenSpells(c.subclassEntry.data.decisionPoints, recorded);
  }
  for (const f of character.build.feats) {
    const featEntry = asFeatEntry(index.get(f.ref));
    if (featEntry) pushChosenSpells(featEntry.data.decisionPoints, f.decisions);
  }

  // --- Resources: numeric class-specific level-table columns, plus any `resource` effect with a fixed/expression max ---
  const resources: ResourceState[] = [];
  for (const c of classBlocks) {
    const levelRow = c.entry?.data.levels.find((l) => l.level === c.levels);
    for (const [key, value] of Object.entries(levelRow?.columns ?? {})) {
      if (typeof value === 'number' && value > 0 && RESOURCE_COLUMN_LABELS[key]) {
        const meta = RESOURCE_COLUMN_LABELS[key];
        resources.push({ id: `${c.shortId}/${key}`, label: meta.label, description: meta.description, max: value, recharge: 'long' });
      }
    }
  }
  for (const p of resourceEffects) {
    if (p.effect.max === 'byLevelTable') continue; // no generic level table to look up for a feat/item-granted resource
    const max = evalExpr(p.effect.max, baseExprCtx);
    if (max > 0) {
      resources.push({ id: p.effect.id, label: humanizeResourceId(p.effect.id), description: `Granted by ${p.label}.`, max, recharge: p.effect.recharge });
    }
  }

  // --- Features: resolved prose for display, tagged by source ---
  const features: DerivedFeature[] = [];
  const seenFeatureRefs = new Set<string>();
  function addFeature(ref: string, source: FeatureSource) {
    if (seenFeatureRefs.has(ref)) return;
    const entry = asFeatureEntry(index.get(ref));
    if (!entry) return;
    seenFeatureRefs.add(ref);
    features.push({ ref, name: entry.name, description: entry.data.description, source });
  }

  for (const ref of speciesEntry?.data.traits ?? []) addFeature(ref, 'species');
  if (backgroundEntry?.data.featureRef) addFeature(backgroundEntry.data.featureRef, 'background');
  for (const ref of classFeatureRefs) addFeature(ref, 'class');
  for (const ref of subclassFeatureRefs) addFeature(ref, 'subclass');
  for (const c of classBlocks) {
    if (c.subclassEntry?.data.description && !seenFeatureRefs.has(c.subclassEntry.id)) {
      seenFeatureRefs.add(c.subclassEntry.id);
      features.push({ ref: c.subclassEntry.id, name: c.subclassEntry.name, description: c.subclassEntry.data.description, source: 'subclass' });
    }
  }
  for (const feat of featEntries) {
    if (!seenFeatureRefs.has(feat.id)) {
      seenFeatureRefs.add(feat.id);
      features.push({ ref: feat.id, name: feat.name, description: feat.data.description, source: 'feat' });
    }
  }

  // --- Speed: species base, overridden/boosted by any `speed` effect (mode "walk"), plus fly/swim/climb modes ---
  let walkSpeed = speciesEntry?.data.speed ?? 30;
  const movementModes: { mode: 'fly' | 'swim' | 'climb'; value: number }[] = [];
  for (const p of speedEffects) {
    if (p.effect.mode === 'walk') {
      if (p.effect.set != null) walkSpeed = p.effect.set;
      if (p.effect.bonus != null) walkSpeed += evalExpr(p.effect.bonus, baseExprCtx);
    } else {
      const value = (p.effect.set ?? walkSpeed) + (p.effect.bonus != null ? evalExpr(p.effect.bonus, baseExprCtx) : 0);
      movementModes.push({ mode: p.effect.mode, value });
    }
  }

  // --- hpBonus: flat and/or per-level bonus HP (e.g. the Tough feat, Dwarven Toughness) ---
  const hpBonusEffects = passiveEffects.filter((p): p is { effect: Extract<Effect, { op: 'hpBonus' }>; label: string } => p.effect.op === 'hpBonus');
  const hpBonus = hpBonusEffects.reduce((sum, p) => {
    const flat = p.effect.flat ? evalExpr(p.effect.flat, baseExprCtx) : 0;
    const perLevel = p.effect.perLevel ? evalExpr(p.effect.perLevel, baseExprCtx) * totalLevel : 0;
    return sum + flat + perLevel;
  }, 0);

  return {
    proficiencyBonus,
    totalLevel,
    abilities,
    savingThrows,
    skills,
    passivePerception,
    senses,
    resistances,
    ac,
    speed: computeSpeed(walkSpeed, exhaustion2014, exhaustion2024),
    initiative: dexMod + initiativeBonus + exhaustionD20Penalty,
    hp: { max: Math.floor(computeMaxHp(character, classBlocks, abilityMods.con) * (exhaustion2014?.hpMaxMultiplier ?? 1)) + hpBonus },
    attacks,
    spellcasting,
    resources,
    features,
    grantedSpellRefs: [...new Set(grantedSpellRefs)],
    sneakAttackDice,
    exhaustionDisadvantage,
    carriedWeight,
    carryingCapacity: abilities.str.score * 15,
    movementModes,
    proficiencies: { tools: [...toolProficiencies], weapons: [...weaponProficiencies], armor: [...armorProficiencies] },
  };
}

function computeSpeed(
  baseSpeed: number,
  exhaustion2014: ReturnType<typeof exhaustionEffects2014> | undefined,
  exhaustion2024: ReturnType<typeof exhaustionEffects2024> | undefined,
): number {
  if (exhaustion2014) return Math.floor(baseSpeed * exhaustion2014.speedMultiplier);
  if (exhaustion2024) return Math.max(0, baseSpeed - exhaustion2024.speedReduction);
  return baseSpeed;
}

function extractSlots(columns: Record<string, string | number | boolean> | undefined): number[] {
  const slots: number[] = new Array(10).fill(0);
  if (!columns) return slots;
  for (const [key, value] of Object.entries(columns)) {
    const match = /^spell_slots_level_(\d)$/.exec(key);
    if (match && typeof value === 'number') slots[Number(match[1])] = value;
  }
  return slots;
}

function extractCantrips(columns: Record<string, string | number | boolean> | undefined): number {
  const value = columns?.cantrips_known;
  return typeof value === 'number' ? value : 0;
}

/** Standard multiclass spellcaster slot table (PHB p.164), indexed by combined caster level. */
const MULTICLASS_SLOT_TABLE: number[][] = [
  [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  [0, 2, 0, 0, 0, 0, 0, 0, 0, 0],
  [0, 3, 0, 0, 0, 0, 0, 0, 0, 0],
  [0, 4, 2, 0, 0, 0, 0, 0, 0, 0],
  [0, 4, 3, 0, 0, 0, 0, 0, 0, 0],
  [0, 4, 3, 2, 0, 0, 0, 0, 0, 0],
  [0, 4, 3, 3, 0, 0, 0, 0, 0, 0],
  [0, 4, 3, 3, 1, 0, 0, 0, 0, 0],
  [0, 4, 3, 3, 2, 0, 0, 0, 0, 0],
  [0, 4, 3, 3, 3, 1, 0, 0, 0, 0],
  [0, 4, 3, 3, 3, 2, 0, 0, 0, 0],
  [0, 4, 3, 3, 3, 2, 1, 0, 0, 0],
  [0, 4, 3, 3, 3, 2, 1, 0, 0, 0],
  [0, 4, 3, 3, 3, 2, 1, 1, 0, 0],
  [0, 4, 3, 3, 3, 2, 1, 1, 0, 0],
  [0, 4, 3, 3, 3, 2, 1, 1, 1, 0],
  [0, 4, 3, 3, 3, 2, 1, 1, 1, 0],
  [0, 4, 3, 3, 3, 2, 1, 1, 1, 1],
  [0, 4, 3, 3, 3, 3, 1, 1, 1, 1],
  [0, 4, 3, 3, 3, 3, 2, 1, 1, 1],
  [0, 4, 3, 3, 3, 3, 2, 2, 1, 1],
];

function mapAbilityMods(baseAbilities: Record<Ability, number>): Record<Ability, number> {
  return Object.fromEntries(ABILITIES.map((a) => [a, abilityMod(baseAbilities[a])])) as Record<Ability, number>;
}

function applyAbilityBonusEffects(
  effects: Effect[],
  sourceLabel: string,
  sources: Record<Ability, Provenance[]>,
  exprCtx: ExprContext,
): void {
  for (const effect of effects) {
    if (effect.op === 'abilityBonus') {
      sources[effect.ability].push({ label: sourceLabel, amount: evalExpr(effect.amount, exprCtx) });
    }
  }
}

/**
 * Walks build.levelOrder — the true chronological record of every level taken,
 * regardless of which class each one belongs to — rather than grouping by class.
 * That's what makes this correct for multiclassing: the very first level ever
 * taken (whichever class it was) gets max hit die; every level after rolls or
 * averages using *that level's own class's* hit die, not whichever class the
 * outer loop happens to be summing.
 */
function computeMaxHp(
  character: Character,
  classBlocks: { ref: string; entry: ReturnType<typeof asClassEntry> }[],
  conMod: number,
): number {
  const hitDieByRef = new Map(classBlocks.map((c) => [c.ref, Number(c.entry?.data.hitDie.slice(1) ?? 8)]));
  return character.build.levelOrder.reduce((total, entry, i) => {
    const hitDieSize = hitDieByRef.get(entry.classRef) ?? 8;
    const hpFromDie = i === 0 ? hitDieSize : (entry.hpRoll ?? Math.floor(hitDieSize / 2) + 1);
    return total + hpFromDie + conMod;
  }, 0);
}

function humanizeResourceId(id: string): string {
  const last = id.split('/').pop() ?? id;
  return last
    .split(/[-_]/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

const SKILL_ABILITY: Record<Skill, Ability> = {
  acrobatics: 'dex',
  animalHandling: 'wis',
  arcana: 'int',
  athletics: 'str',
  deception: 'cha',
  history: 'int',
  insight: 'wis',
  intimidation: 'cha',
  investigation: 'int',
  medicine: 'wis',
  nature: 'int',
  perception: 'wis',
  performance: 'cha',
  persuasion: 'cha',
  religion: 'int',
  sleightOfHand: 'dex',
  stealth: 'dex',
  survival: 'wis',
};

const RESOURCE_COLUMN_LABELS: Record<string, { label: string; description: string }> = {
  rage_count: { label: 'Rages', description: 'Spend one to rage as a bonus action, gaining a melee damage bonus and resistance to bludgeoning/piercing/slashing.' },
  ki_points: { label: 'Ki Points', description: 'Fuel Flurry of Blows, Patient Defense, Step of the Wind, and other Monk features.' },
  action_surges: { label: 'Action Surges', description: 'Take one additional action on your turn.' },
  indomitable_uses: { label: 'Indomitable Uses', description: 'Reroll a failed saving throw and use the new result.' },
  sorcery_points: { label: 'Sorcery Points', description: 'Spend to create spell slots or fuel Metamagic options.' },
  channel_divinity_charges: { label: 'Channel Divinity', description: "Fuel your class/domain's Channel Divinity options." },
};
