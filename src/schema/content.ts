import { z } from 'zod';
import {
  AbilitySchema,
  DamageTypeSchema,
  DecisionPointSchema,
  EditionSchema,
  SourceSchema,
} from './common';
import { EffectSchema } from './effects';

// ---------------------------------------------------------------------------
// Spell
// ---------------------------------------------------------------------------

export const SpellSchoolSchema = z.enum([
  'abjuration',
  'conjuration',
  'divination',
  'enchantment',
  'evocation',
  'illusion',
  'necromancy',
  'transmutation',
]);

export const SpellPayloadSchema = z.object({
  level: z.number().int().min(0).max(9), // 0 = cantrip
  school: SpellSchoolSchema,
  castingTime: z.string(),
  range: z.string(),
  components: z.object({
    verbal: z.boolean(),
    somatic: z.boolean(),
    material: z.string().optional(), // material description, e.g. "a pinch of sulfur"
  }),
  duration: z.string(),
  concentration: z.boolean(),
  ritual: z.boolean(),
  classLists: z.array(z.string()), // class ids that can learn/prepare this spell
  description: z.string(),
  higherLevels: z.string().optional(),
});
export type SpellPayload = z.infer<typeof SpellPayloadSchema>;

// ---------------------------------------------------------------------------
// Item
// ---------------------------------------------------------------------------

export const ItemCategorySchema = z.enum([
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
]);

export const ItemRaritySchema = z.enum([
  'mundane',
  'common',
  'uncommon',
  'rare',
  'veryRare',
  'legendary',
  'artifact',
]);

export const WeaponPropsSchema = z.object({
  damageDice: z.string(), // e.g. "1d8"
  damageType: DamageTypeSchema,
  properties: z.array(z.string()), // e.g. ["finesse","light"], 2024 mastery keyed separately
  mastery: z.string().optional(), // 2024 weapon mastery property
  versatileDamageDice: z.string().optional(),
  range: z.object({ normal: z.number().int(), long: z.number().int() }).optional(),
});
export type WeaponProps = z.infer<typeof WeaponPropsSchema>;

export const ArmorPropsSchema = z.object({
  baseAc: z.number().int(),
  addDexMod: z.boolean(),
  maxDexBonus: z.number().int().optional(),
  strengthRequirement: z.number().int().optional(),
  stealthDisadvantage: z.boolean(),
});
export type ArmorProps = z.infer<typeof ArmorPropsSchema>;

export const ItemPayloadSchema = z.object({
  category: ItemCategorySchema,
  rarity: ItemRaritySchema,
  cost: z.object({ amount: z.number().nonnegative(), currency: z.enum(['cp', 'sp', 'ep', 'gp', 'pp']) }).optional(),
  weight: z.number().nonnegative().optional(),
  attunement: z.union([z.boolean(), z.object({ required: z.literal(true), prerequisite: z.string() })]).default(false),
  description: z.string(),
  weapon: WeaponPropsSchema.optional(),
  armor: ArmorPropsSchema.optional(),
});
export type ItemPayload = z.infer<typeof ItemPayloadSchema>;

// ---------------------------------------------------------------------------
// Feat
// ---------------------------------------------------------------------------

export const FeatPayloadSchema = z.object({
  prerequisite: z.string().optional(),
  description: z.string(),
  decisionPoints: z.array(DecisionPointSchema).optional(),
});
export type FeatPayload = z.infer<typeof FeatPayloadSchema>;

// ---------------------------------------------------------------------------
// Feature (a single class/species/background feature; referenced from level tables)
// ---------------------------------------------------------------------------

export const FeaturePayloadSchema = z.object({
  description: z.string(),
  decisionPoints: z.array(DecisionPointSchema).optional(),
});
export type FeaturePayload = z.infer<typeof FeaturePayloadSchema>;

// ---------------------------------------------------------------------------
// Class
// ---------------------------------------------------------------------------

export const SpellcastingProgressionSchema = z.enum(['none', 'full', 'half', 'third', 'pact']);

export const ClassLevelEntrySchema = z.object({
  level: z.number().int().min(1).max(20),
  featureRefs: z.array(z.string()),
  proficiencyBonus: z.number().int(),
  // arbitrary per-class scalar columns, e.g. { sneakAttackDice: 2, martialArtsDie: "1d6" }
  columns: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
});

export const ResourceDefSchema = z.object({
  id: z.string(),
  label: z.string(),
  maxFormula: z.union([z.string(), z.literal('byLevelTable')]),
  recharge: z.enum(['short', 'long', 'none']),
});

export const ClassPayloadSchema = z.object({
  /** Flavor prose shown when browsing/picking this class. Optional forever —
   * see BackgroundPayloadSchema's note for why these are never made required. */
  description: z.string().optional(),
  hitDie: z.enum(['d6', 'd8', 'd10', 'd12']),
  savingThrowProficiencies: z.array(AbilitySchema),
  armorProficiencies: z.array(z.string()),
  weaponProficiencies: z.array(z.string()),
  toolProficiencies: z.array(z.string()).optional(),
  skillChoice: z.object({ count: z.number().int(), options: z.array(z.string()) }).optional(),
  spellcasting: z
    .object({
      progression: SpellcastingProgressionSchema,
      ability: AbilitySchema,
      knownOrPrepared: z.enum(['known', 'prepared']),
    })
    .optional(),
  levels: z.array(ClassLevelEntrySchema),
  resources: z.array(ResourceDefSchema).optional(),
  decisionPoints: z.array(DecisionPointSchema).optional(),
  /** Starting gear at level 1 — a player takes either the fixed items + one
   * option per choice group, OR the flat gold alternative, never both. */
  startingEquipment: z
    .object({
      fixed: z.array(z.string()), // item refs always granted
      choices: z.array(
        z.object({
          prompt: z.string(),
          options: z.array(z.array(z.string())), // each option is a bundle of item refs
        }),
      ),
      goldAlternative: z.number().nonnegative(),
    })
    .optional(),
});
export type ClassPayload = z.infer<typeof ClassPayloadSchema>;

export const SubclassPayloadSchema = z.object({
  parentClassRef: z.string(),
  description: z.string().optional(),
  featuresByLevel: z.record(z.string(), z.array(z.string())), // level (string) -> featureRefs
  /** Domain/oath/expanded-list spells always prepared/known once unlocked — not counted against the class's known-spell cap. */
  grantedSpellsByLevel: z.record(z.string(), z.array(z.string())).optional(),
  decisionPoints: z.array(DecisionPointSchema).optional(),
});
export type SubclassPayload = z.infer<typeof SubclassPayloadSchema>;

// ---------------------------------------------------------------------------
// Species / Background
// ---------------------------------------------------------------------------

export const SpeciesPayloadSchema = z.object({
  /** Flavor prose shown when browsing/picking this species. */
  description: z.string().optional(),
  size: z.enum(['tiny', 'small', 'medium', 'large']),
  speed: z.number().int().positive(),
  traits: z.array(z.string()), // featureRefs
  /** Set on a subrace/subspecies entry — the base species it derives from (e.g. High Elf -> Elf). */
  parentSpeciesRef: z.string().optional(),
  decisionPoints: z.array(DecisionPointSchema).optional(),
});
export type SpeciesPayload = z.infer<typeof SpeciesPayloadSchema>;

export const BackgroundPayloadSchema = z.object({
  /**
   * Flavor prose shown when browsing/picking this background.
   *
   * Optional, and deliberately staying that way. Making any `description`
   * required would make a user's previously-saved custom entry (origin:'custom',
   * written straight to Dexie by the Library editor) fail to parse on the next
   * app load — `migrateContentEntry` throws rather than repairing. Seed-content
   * coverage is enforced by `pnpm validate:data --strict-descriptions` instead,
   * which is where the ratchet belongs. Prose-only content is a valid permanent
   * end state (see CLAUDE.md); absent prose is just less useful, not invalid.
   */
  description: z.string().optional(),
  skillProficiencies: z.array(z.string()),
  toolProficiencies: z.array(z.string()).optional(),
  equipment: z.array(z.string()),
  featureRef: z.string().optional(),
  /** 2024-only: the 3 abilities a player can allocate +2/+1 (or +1/+1/+1) across, replacing racial ability bonuses. */
  abilityScoreOptions: z.array(AbilitySchema).optional(),
  /** 2024-only: every background grants a starting Origin feat directly. */
  grantedFeatRef: z.string().optional(),
  decisionPoints: z.array(DecisionPointSchema).optional(),
});
export type BackgroundPayload = z.infer<typeof BackgroundPayloadSchema>;

// ---------------------------------------------------------------------------
// Condition
// ---------------------------------------------------------------------------

export const ConditionPayloadSchema = z.object({
  description: z.string(),
});
export type ConditionPayload = z.infer<typeof ConditionPayloadSchema>;

// ---------------------------------------------------------------------------
// ContentEntry envelope
// ---------------------------------------------------------------------------

export const ContentKindSchema = z.enum([
  'spell',
  'item',
  'feat',
  'class',
  'subclass',
  'species',
  'background',
  'condition',
  'feature',
]);
export type ContentKind = z.infer<typeof ContentKindSchema>;

const OriginSchema = z.enum(['seed', 'extracted', 'custom']);

const BaseEntrySchema = z.object({
  id: z.string().min(1),
  edition: EditionSchema,
  name: z.string().min(1),
  source: SourceSchema,
  origin: OriginSchema,
  effects: z.array(EffectSchema).optional(),
  crossEditionRef: z.string().optional(),
  schemaVersion: z.number().int().positive(),
});

export const ContentEntrySchema = z.discriminatedUnion('kind', [
  BaseEntrySchema.extend({ kind: z.literal('spell'), data: SpellPayloadSchema }),
  BaseEntrySchema.extend({ kind: z.literal('item'), data: ItemPayloadSchema }),
  BaseEntrySchema.extend({ kind: z.literal('feat'), data: FeatPayloadSchema }),
  BaseEntrySchema.extend({ kind: z.literal('class'), data: ClassPayloadSchema }),
  BaseEntrySchema.extend({ kind: z.literal('subclass'), data: SubclassPayloadSchema }),
  BaseEntrySchema.extend({ kind: z.literal('species'), data: SpeciesPayloadSchema }),
  BaseEntrySchema.extend({ kind: z.literal('background'), data: BackgroundPayloadSchema }),
  BaseEntrySchema.extend({ kind: z.literal('condition'), data: ConditionPayloadSchema }),
  BaseEntrySchema.extend({ kind: z.literal('feature'), data: FeaturePayloadSchema }),
]);
export type ContentEntry = z.infer<typeof ContentEntrySchema>;

export type ContentEntryOfKind<K extends ContentKind> = Extract<ContentEntry, { kind: K }>;
