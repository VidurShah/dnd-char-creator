import type { Character } from '@/schema/character';
import type { ContentEntry } from '@/schema/content';
import type { BuilderState } from './builder/builderState';
import { resolveItemRef } from './builder/resolveItemRef';

/** Background-granted gear + the class's fixed/chosen starting equipment (unless gold was taken instead). */
function grantedEquipmentRefs(
  items: ContentEntry[],
  backgroundEntry: ContentEntry | undefined,
  classEntry: ContentEntry | undefined,
  equipmentChoicePicks: number[],
  takeStartingGold: boolean,
): string[] {
  const refs: string[] = [];
  if (backgroundEntry?.kind === 'background') refs.push(...backgroundEntry.data.equipment);
  const startingEquipment = classEntry?.kind === 'class' ? classEntry.data.startingEquipment : undefined;
  if (startingEquipment && !takeStartingGold) {
    refs.push(...startingEquipment.fixed);
    startingEquipment.choices.forEach((choice, i) => {
      const picked = choice.options[equipmentChoicePicks[i] ?? 0];
      if (picked) refs.push(...picked);
    });
  }
  return refs.map((ref) => resolveItemRef(items, ref)?.id).filter((id): id is string => id != null);
}

/**
 * Builds a full, ready-to-save Character from a BuilderState-shaped input.
 * Shared by the step-by-step wizard (BuilderPage) and premade templates
 * (TemplatesPage), so equipment-granting/inventory-merging logic lives in
 * exactly one place.
 */
export function buildCharacter(state: BuilderState, items: ContentEntry[], byId: Map<string, ContentEntry>): Character {
  const now = Date.now();
  const backgroundDecisions = Object.entries(state.backgroundAbilityAllocation)
    .filter(([, amount]) => (amount ?? 0) > 0)
    .map(([ability, amount]) => `${ability}:${amount}`);

  const backgroundEntry = state.backgroundRef ? byId.get(state.backgroundRef) : undefined;
  const classEntry = state.classRef ? byId.get(state.classRef) : undefined;
  const grantedRefs = grantedEquipmentRefs(items, backgroundEntry, classEntry, state.equipmentChoicePicks, state.takeStartingGold);
  const manualRefs = new Set(state.inventory.map((i) => i.itemRef));
  const itemById = new Map(items.map((i) => [i.id, i]));
  const grantedCounts = new Map<string, number>();
  for (const ref of grantedRefs) {
    if (manualRefs.has(ref)) continue;
    grantedCounts.set(ref, (grantedCounts.get(ref) ?? 0) + 1);
  }
  const combinedInventory = [
    ...[...grantedCounts.entries()].map(([ref, qty]) => {
      const item = itemById.get(ref);
      const equipped = item?.kind === 'item' && (item.data.category === 'weapon' || item.data.category === 'armor' || item.data.category === 'shield');
      return { itemRef: ref, qty, equipped: equipped ?? false, attuned: false };
    }),
    ...state.inventory.map((i) => ({ itemRef: i.itemRef, qty: i.qty, equipped: i.equipped, attuned: false })),
  ];

  return {
    id: crypto.randomUUID(),
    edition: state.edition,
    name: state.name.trim() || 'Unnamed Adventurer',
    createdAt: now,
    updatedAt: now,
    schemaVersion: 1,
    build: {
      abilityMethod: 'manual',
      baseAbilities: state.baseAbilities,
      species: { ref: state.speciesRef ?? '', decisions: [] },
      background: {
        ref: state.backgroundRef ?? '',
        decisions: backgroundDecisions.length > 0 ? [{ decisionId: 'background/ability-scores', choice: backgroundDecisions }] : [],
      },
      classes: state.classRef
        ? [{ classRef: state.classRef, subclassRef: state.subclassRef, levels: 1, decisionsByLevel: { '1': state.classDecisions } }]
        : [],
      levelOrder: state.classRef ? [{ classRef: state.classRef }] : [],
      knownSpells: state.knownSpells,
      preparedSpells: state.knownSpells,
      feats: state.featRefs.map((ref) => ({ ref, decisions: [] })),
      abilityImprovements: [],
    },
    state: {
      hp: { current: 1, tempHp: 0 },
      hitDiceSpent: {},
      conditions: [],
      exhaustion: 0,
      deathSaves: { successes: 0, failures: 0 },
      spellSlotsSpent: [],
      pactSlotsSpent: 0,
      resourcesSpent: {},
      inventory: combinedInventory,
      currency: state.currency,
      inspiration: false,
      raging: false,
      notes: state.notes,
      languages: '',
      alignment: state.alignment,
      personalityTraits: state.personalityTraits,
      ideals: state.ideals,
      bonds: state.bonds,
      flaws: state.flaws,
      rollLog: [],
    },
  };
}
