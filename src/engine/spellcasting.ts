import type { ContentEntry } from '@/schema/content';

/**
 * How a class chooses its leveled spells, which drives both the count the builder
 * asks for and the label it shows:
 *  - 'known'     — a fixed list you pick (Bard/Sorcerer/Ranger/Warlock), from the `spells_known` column.
 *  - 'spellbook' — Wizard's book: 6 at level 1, +2 per level; cast by preparing from it.
 *  - 'prepared'  — Cleric/Druid/Paladin/Artificer prepare from their *entire* class list,
 *                  swappable on a long rest; the count is how many they prepare.
 */
export type SpellSelectionMode = 'known' | 'spellbook' | 'prepared';

export interface SpellSelectionPlan {
  isCaster: boolean;
  mode: SpellSelectionMode;
  /** Cantrips known at this class level (from the level table). */
  cantripsKnown: number;
  /** Leveled spells to select at this class level — spells known, spellbook size, or number prepared. */
  leveledCount: number;
  /** True for prepared casters that draw from the whole class list (not a fixed known set). */
  wholeList: boolean;
  /** Heading for the leveled-spell section. */
  leveledLabel: string;
  /** One-line explanation under the heading. */
  hint: string;
}

const NONE: SpellSelectionPlan = {
  isCaster: false,
  mode: 'known',
  cantripsKnown: 0,
  leveledCount: 0,
  wholeList: false,
  leveledLabel: '',
  hint: '',
};

/** Classes whose "prepared" spells come from a spellbook they build up, rather than the whole class list. */
const SPELLBOOK_CLASSES = new Set(['wizard']);

function num(columns: Record<string, unknown> | undefined, key: string): number {
  const v = columns?.[key];
  return typeof v === 'number' ? v : 0;
}

/**
 * The spell-selection plan for a class at a given level. Pure and data-driven:
 * counts come from the class's own level table (`cantrips_known`, `spells_known`,
 * `spell_slots_level_*`) plus the well-known Wizard-spellbook and prepared-caster
 * formulas, so the builder, AI builder, and level-up all agree.
 */
export function spellSelectionPlan(
  classEntry: ContentEntry | undefined,
  classLevel: number,
  spellAbilityMod: number,
): SpellSelectionPlan {
  if (classEntry?.kind !== 'class' || !classEntry.data.spellcasting) return NONE;
  const meta = classEntry.data.spellcasting;
  const shortId = classEntry.id.split('/').pop() ?? '';
  const columns = classEntry.data.levels.find((l) => l.level === classLevel)?.columns as Record<string, unknown> | undefined;
  const cantripsKnown = num(columns, 'cantrips_known');
  // Pact Magic never lists slots in these columns the same way, but a warlock always casts.
  const hasLeveledSlots = meta.progression === 'pact' || Array.from({ length: 9 }, (_, i) => num(columns, `spell_slots_level_${i + 1}`)).some((n) => n > 0);

  if (meta.knownOrPrepared === 'known') {
    return {
      isCaster: true,
      mode: 'known',
      cantripsKnown,
      leveledCount: num(columns, 'spells_known'),
      wholeList: false,
      leveledLabel: 'Spells Known',
      hint: 'The spells you know. You can swap one for another when you level up.',
    };
  }

  if (SPELLBOOK_CLASSES.has(shortId)) {
    return {
      isCaster: true,
      mode: 'spellbook',
      cantripsKnown,
      leveledCount: 6 + 2 * Math.max(0, classLevel - 1),
      wholeList: false,
      leveledLabel: 'Spellbook',
      hint: 'Spells scribed in your spellbook — you can add more anytime from the character sheet.',
    };
  }

  // Prepared from the whole class list: Cleric/Druid (full) prepare mod + level;
  // Paladin/Artificer (half) prepare mod + floor(level/2). No leveled slots (e.g. a
  // level-1 Paladin) means no leveled spells prepared yet, cantrips aside.
  const levelFactor = meta.progression === 'full' ? classLevel : Math.floor(classLevel / 2);
  const leveledCount = hasLeveledSlots ? Math.max(1, spellAbilityMod + levelFactor) : 0;
  return {
    isCaster: true,
    mode: 'prepared',
    cantripsKnown,
    leveledCount,
    wholeList: true,
    leveledLabel: 'Prepared Spells',
    hint: `You prepare spells from the entire ${classEntry.name} spell list and can change them after a long rest.`,
  };
}
