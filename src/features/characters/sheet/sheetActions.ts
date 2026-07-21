import { characterRepo } from '@/db/repos';
import type { Character, CharacterBuild, CharacterState } from '@/schema/character';
import type { Ability } from '@/schema/common';
import type { DerivedSheet } from '@/engine/compute';
import { parseDiceString, rollD20, rollDice, type AdvantageMode, type DiceRollResult } from '@/engine/dice';

async function patch(character: Character, patchState: (state: CharacterState) => CharacterState): Promise<void> {
  const updated: Character = { ...character, updatedAt: Date.now(), state: patchState(character.state) };
  await characterRepo.save(updated);
}

async function patchBuild(character: Character, patchBuildFn: (build: CharacterBuild) => CharacterBuild): Promise<void> {
  const updated: Character = { ...character, updatedAt: Date.now(), build: patchBuildFn(character.build) };
  await characterRepo.save(updated);
}

/** Sets a class's subclass after the fact — e.g. once the level-up decision panel confirms it unlocked. */
export function setSubclass(character: Character, classRef: string, subclassRef: string): Promise<void> {
  return patchBuild(character, (build) => ({
    ...build,
    classes: build.classes.map((c) => (c.classRef === classRef ? { ...c, subclassRef } : c)),
  }));
}

/** Records a class-scoped decision answer (e.g. Rogue/Bard Expertise) at a specific level, as picked in the level-up panel. */
export function applyClassDecision(character: Character, classRef: string, level: number, decisionId: string, choice: string[]): Promise<void> {
  return patchBuild(character, (build) => ({
    ...build,
    classes: build.classes.map((c) => {
      if (c.classRef !== classRef) return c;
      const levelKey = String(level);
      const existing = (c.decisionsByLevel[levelKey] ?? []).filter((d) => d.decisionId !== decisionId);
      return { ...c, decisionsByLevel: { ...c.decisionsByLevel, [levelKey]: [...existing, { decisionId, choice }] } };
    }),
  }));
}

/** Records an Ability Score Improvement taken at a given class level (+2 one ability, or +1 to two). */
export function applyAbilityImprovement(character: Character, classRef: string, level: number, abilities: Partial<Record<Ability, number>>): Promise<void> {
  return patchBuild(character, (build) => ({
    ...build,
    abilityImprovements: [...build.abilityImprovements, { level, classRef, abilities }],
  }));
}

/** Adds a feat post-creation — used when a player takes a feat instead of an Ability Score Improvement. */
export function addFeat(character: Character, featRef: string): Promise<void> {
  return patchBuild(character, (build) => ({
    ...build,
    feats: [...build.feats, { ref: featRef, decisions: [] }],
  }));
}

export function adjustHp(character: Character, delta: number, max: number): Promise<void> {
  return patch(character, (state) => {
    let tempHp = state.hp.tempHp;
    let current = state.hp.current;
    if (delta < 0) {
      // Damage eats into temp HP first.
      const absorbed = Math.min(tempHp, -delta);
      tempHp -= absorbed;
      current = Math.max(0, current - (-delta - absorbed));
    } else {
      current = Math.min(max, current + delta);
    }
    return { ...state, hp: { ...state.hp, current, tempHp } };
  });
}

export function setTempHp(character: Character, value: number): Promise<void> {
  return patch(character, (state) => ({ ...state, hp: { ...state.hp, tempHp: Math.max(0, value) } }));
}

export function toggleCondition(character: Character, ref: string): Promise<void> {
  return patch(character, (state) => {
    const has = state.conditions.some((c) => c.ref === ref);
    return { ...state, conditions: has ? state.conditions.filter((c) => c.ref !== ref) : [...state.conditions, { ref }] };
  });
}

export function toggleRaging(character: Character): Promise<void> {
  return patch(character, (state) => ({ ...state, raging: !state.raging }));
}

export function setExhaustion(character: Character, level: number): Promise<void> {
  return patch(character, (state) => ({ ...state, exhaustion: Math.min(6, Math.max(0, level)) }));
}

export function setDeathSave(character: Character, kind: 'successes' | 'failures', value: number): Promise<void> {
  return patch(character, (state) => ({ ...state, deathSaves: { ...state.deathSaves, [kind]: Math.min(3, Math.max(0, value)) } }));
}

export function toggleSlotSpent(character: Character, level: number, slotIndex: number): Promise<void> {
  return patch(character, (state) => {
    const spent = state.spellSlotsSpent[level] ?? 0;
    const spending = slotIndex >= spent;
    const spellSlotsSpent = [...state.spellSlotsSpent];
    spellSlotsSpent[level] = spending ? spent + 1 : spent - 1;
    return { ...state, spellSlotsSpent };
  });
}

export function adjustResourceSpent(character: Character, resourceId: string, delta: number, max: number): Promise<void> {
  return patch(character, (state) => {
    const current = state.resourcesSpent[resourceId] ?? 0;
    const next = Math.min(max, Math.max(0, current + delta));
    return { ...state, resourcesSpent: { ...state.resourcesSpent, [resourceId]: next } };
  });
}

export function shortRest(character: Character, sheet: DerivedSheet): Promise<void> {
  return patch(character, (state) => ({
    ...state,
    // Pact Magic recharges on a short rest, unlike regular spell slots.
    pactSlotsSpent: 0,
    resourcesSpent: Object.fromEntries(sheet.resources.filter((r) => r.recharge !== 'short').map((r) => [r.id, state.resourcesSpent[r.id] ?? 0])),
  }));
}

export function longRest(character: Character, sheet: DerivedSheet): Promise<void> {
  return patch(character, (state) => ({
    ...state,
    hp: { ...state.hp, current: sheet.hp.max },
    spellSlotsSpent: [],
    pactSlotsSpent: 0,
    resourcesSpent: {},
    exhaustion: Math.max(0, state.exhaustion - 1),
  }));
}

export function togglePactSlotSpent(character: Character, slotIndex: number): Promise<void> {
  return patch(character, (state) => {
    const spent = state.pactSlotsSpent;
    return { ...state, pactSlotsSpent: slotIndex >= spent ? spent + 1 : spent - 1 };
  });
}

export function toggleEquipped(character: Character, itemRef: string): Promise<void> {
  return patch(character, (state) => ({
    ...state,
    inventory: state.inventory.map((i) => (i.itemRef === itemRef ? { ...i, equipped: !i.equipped } : i)),
  }));
}

export function toggleAttuned(character: Character, itemRef: string): Promise<void> {
  return patch(character, (state) => ({
    ...state,
    inventory: state.inventory.map((i) => (i.itemRef === itemRef ? { ...i, attuned: !i.attuned } : i)),
  }));
}

export function removeInventoryItem(character: Character, itemRef: string): Promise<void> {
  return patch(character, (state) => ({ ...state, inventory: state.inventory.filter((i) => i.itemRef !== itemRef) }));
}

export function addInventoryItem(character: Character, itemRef: string): Promise<void> {
  return patch(character, (state) => {
    if (state.inventory.some((i) => i.itemRef === itemRef)) return state;
    return { ...state, inventory: [...state.inventory, { itemRef, qty: 1, equipped: false, attuned: false }] };
  });
}

export function setCurrency(character: Character, currency: CharacterState['currency']): Promise<void> {
  return patch(character, (state) => ({ ...state, currency }));
}

export function setLanguages(character: Character, languages: string): Promise<void> {
  return patch(character, (state) => ({ ...state, languages }));
}

export function setPersonalityField(
  character: Character,
  field: 'alignment' | 'personalityTraits' | 'ideals' | 'bonds' | 'flaws' | 'notes',
  value: string,
): Promise<void> {
  return patch(character, (state) => ({ ...state, [field]: value }));
}

function appendRoll(character: Character, label: string, formula: string, rolls: number[], total: number): Promise<void> {
  return patch(character, (state) => ({
    ...state,
    rollLog: [{ id: crypto.randomUUID(), timestamp: Date.now(), label, formula, rolls, total }, ...state.rollLog].slice(0, 30),
  }));
}

/**
 * Rolls immediately (synchronously) so the caller can show the result right where
 * it was rolled, and persists the entry to the roll log in the background.
 */
export function rollCheck(character: Character, label: string, modifier: number, mode: AdvantageMode = 'normal'): DiceRollResult {
  const result = rollD20(mode, modifier);
  const formula = mode === 'normal' ? `d20${modifier >= 0 ? '+' : ''}${modifier}` : `d20 (${mode})${modifier >= 0 ? '+' : ''}${modifier}`;
  void appendRoll(character, label, formula, result.rolls, result.total);
  return result;
}

export function rollDamage(character: Character, label: string, dice: string, modifier: number): DiceRollResult {
  const { count, sides } = parseDiceString(dice);
  const result = rollDice(count, sides, modifier);
  void appendRoll(character, label, `${dice}${modifier >= 0 ? '+' : ''}${modifier}`, result.rolls, result.total);
  return result;
}
