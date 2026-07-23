import type { Ability, Decision, Edition } from '@/schema/common';

export interface BuilderInventoryDraft {
  itemRef: string;
  qty: number;
  equipped: boolean;
}

/** Accumulates choices across builder steps before being turned into a saved Character. */
export interface BuilderState {
  edition: Edition;
  name: string;
  baseAbilities: Record<Ability, number>;
  speciesRef?: string;
  classRef?: string;
  subclassRef?: string;
  backgroundRef?: string;
  /** 2024-only: how a background's ability-score allocation (+2/+1 or +1/+1/+1) is split. */
  backgroundAbilityAllocation: Partial<Record<Ability, number>>;
  featRefs: string[];
  /** Answers to decision points the species declares (2024 lineages, Variant
   * Human's skill/ability picks). Kept separate from classDecisions so that
   * changing class — which resets class choices — doesn't wipe them. */
  speciesDecisions: Decision[];
  classDecisions: Decision[];
  knownSpells: string[];
  inventory: BuilderInventoryDraft[];
  currency: { cp: number; sp: number; ep: number; gp: number; pp: number };
  /** Index into each of the class's startingEquipment.choices — which option was picked. */
  equipmentChoicePicks: number[];
  /** If true, skip the class's fixed/choice equipment and take goldAlternative gp instead. */
  takeStartingGold: boolean;
  alignment: string;
  /** Comma-joined language names — languages aren't modeled as content, so this mirrors CharacterState.languages. */
  languages: string;
  personalityTraits: string;
  ideals: string;
  bonds: string;
  flaws: string;
  notes: string;
}

export function emptyBuilderState(): BuilderState {
  return {
    edition: '2014',
    name: '',
    baseAbilities: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
    backgroundAbilityAllocation: {},
    featRefs: [],
    speciesDecisions: [],
    classDecisions: [],
    knownSpells: [],
    inventory: [],
    currency: { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 },
    equipmentChoicePicks: [],
    takeStartingGold: false,
    alignment: '',
    languages: '',
    personalityTraits: '',
    ideals: '',
    bonds: '',
    flaws: '',
    notes: '',
  };
}

export const STANDARD_ARRAY = [15, 14, 13, 12, 10, 8] as const;
export const ABILITY_ORDER: Ability[] = ['str', 'dex', 'con', 'int', 'wis', 'cha'];
export const ABILITY_LABEL: Record<Ability, string> = {
  str: 'Strength',
  dex: 'Dexterity',
  con: 'Constitution',
  int: 'Intelligence',
  wis: 'Wisdom',
  cha: 'Charisma',
};
