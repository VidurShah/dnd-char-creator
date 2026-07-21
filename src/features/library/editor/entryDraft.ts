import type { SpellPayload, ItemPayload, FeatPayload } from '@/schema/content';

export type EditableKind = 'spell' | 'item' | 'feat';

export function emptySpellDraft(): SpellPayload {
  return {
    level: 0,
    school: 'evocation',
    castingTime: '1 action',
    range: 'Self',
    components: { verbal: true, somatic: true },
    duration: 'Instantaneous',
    concentration: false,
    ritual: false,
    classLists: [],
    description: '',
  };
}

export function emptyItemDraft(): ItemPayload {
  return {
    category: 'adventuringGear',
    rarity: 'mundane',
    attunement: false,
    description: '',
  };
}

export function emptyFeatDraft(): FeatPayload {
  return { description: '' };
}
