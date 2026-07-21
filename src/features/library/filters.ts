import type { ContentEntry, ItemCategorySchema, ItemRaritySchema, SpellSchoolSchema } from '@/schema/content';
import { z } from 'zod';

export type SpellSchool = z.infer<typeof SpellSchoolSchema>;
export type ItemCategory = z.infer<typeof ItemCategorySchema>;
export type ItemRarity = z.infer<typeof ItemRaritySchema>;

export const SPELL_LEVELS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] as const;
export const SPELL_LEVEL_LABEL: Record<number, string> = {
  0: 'Cantrip',
  1: '1st',
  2: '2nd',
  3: '3rd',
  4: '4th',
  5: '5th',
  6: '6th',
  7: '7th',
  8: '8th',
  9: '9th',
};

export const SPELL_SCHOOLS: SpellSchool[] = [
  'abjuration',
  'conjuration',
  'divination',
  'enchantment',
  'evocation',
  'illusion',
  'necromancy',
  'transmutation',
];

export const ITEM_CATEGORIES: ItemCategory[] = [
  'weapon',
  'armor',
  'shield',
  'adventuringGear',
  'tool',
  'consumable',
  'wondrousItem',
  'ring',
  'rod',
  'staff',
  'wand',
  'ammunition',
];

export const ITEM_RARITIES: ItemRarity[] = [
  'mundane',
  'common',
  'uncommon',
  'rare',
  'veryRare',
  'legendary',
  'artifact',
];

export interface SpellFilters {
  levels: Set<number>;
  schools: Set<SpellSchool>;
  classes: Set<string>;
  concentrationOnly: boolean;
  ritualOnly: boolean;
}

export interface ItemFilters {
  categories: Set<ItemCategory>;
  rarities: Set<ItemRarity>;
  maxCostGp: number | null;
  maxWeight: number | null;
}

export function emptySpellFilters(): SpellFilters {
  return { levels: new Set(), schools: new Set(), classes: new Set(), concentrationOnly: false, ritualOnly: false };
}

export function emptyItemFilters(): ItemFilters {
  return { categories: new Set(), rarities: new Set(), maxCostGp: null, maxWeight: null };
}

export function isSpellFiltersEmpty(f: SpellFilters): boolean {
  return f.levels.size === 0 && f.schools.size === 0 && f.classes.size === 0 && !f.concentrationOnly && !f.ritualOnly;
}

export function isItemFiltersEmpty(f: ItemFilters): boolean {
  return f.categories.size === 0 && f.rarities.size === 0 && f.maxCostGp == null && f.maxWeight == null;
}

const CURRENCY_TO_GP: Record<string, number> = { cp: 0.01, sp: 0.1, ep: 0.5, gp: 1, pp: 10 };

function costInGp(cost: { amount: number; currency: string } | undefined): number {
  if (!cost) return 0;
  return cost.amount * (CURRENCY_TO_GP[cost.currency] ?? 1);
}

export function matchesSpellFilters(entry: Extract<ContentEntry, { kind: 'spell' }>, f: SpellFilters): boolean {
  if (f.levels.size > 0 && !f.levels.has(entry.data.level)) return false;
  if (f.schools.size > 0 && !f.schools.has(entry.data.school)) return false;
  if (f.classes.size > 0 && !entry.data.classLists.some((c) => f.classes.has(c))) return false;
  if (f.concentrationOnly && !entry.data.concentration) return false;
  if (f.ritualOnly && !entry.data.ritual) return false;
  return true;
}

export function matchesItemFilters(entry: Extract<ContentEntry, { kind: 'item' }>, f: ItemFilters): boolean {
  if (f.categories.size > 0 && !f.categories.has(entry.data.category)) return false;
  if (f.rarities.size > 0 && !f.rarities.has(entry.data.rarity)) return false;
  if (f.maxCostGp != null && costInGp(entry.data.cost) > f.maxCostGp) return false;
  if (f.maxWeight != null && entry.data.weight != null && entry.data.weight > f.maxWeight) return false;
  return true;
}

export function toggleInSet<T>(set: Set<T>, value: T): Set<T> {
  const next = new Set(set);
  if (next.has(value)) next.delete(value);
  else next.add(value);
  return next;
}
