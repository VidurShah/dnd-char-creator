import { z } from 'zod';
import { AbilitySchema, DecisionSchema, EditionSchema } from './common';

const AbilityMethodSchema = z.enum(['standardArray', 'pointBuy', 'manual', 'rolled']);

const ClassLevelBlockSchema = z.object({
  classRef: z.string(),
  subclassRef: z.string().optional(),
  levels: z.number().int().positive(),
  decisionsByLevel: z.record(z.string(), z.array(DecisionSchema)),
});

const LevelOrderEntrySchema = z.object({
  classRef: z.string(),
  hpRoll: z.number().int().positive().optional(), // undefined = took average
});

export const CharacterBuildSchema = z.object({
  abilityMethod: AbilityMethodSchema,
  baseAbilities: z.record(AbilitySchema, z.number().int()),
  species: z.object({ ref: z.string(), decisions: z.array(DecisionSchema) }),
  background: z.object({ ref: z.string(), decisions: z.array(DecisionSchema) }),
  classes: z.array(ClassLevelBlockSchema),
  levelOrder: z.array(LevelOrderEntrySchema),
  knownSpells: z.array(z.string()),
  preparedSpells: z.array(z.string()),
  feats: z.array(z.object({ ref: z.string(), decisions: z.array(DecisionSchema) })).default([]),
  /** Ability Score Improvements taken at ASI levels (4/8/12/16/19, plus extra for Fighter/Rogue) — a feat taken instead is just pushed onto `feats`. */
  abilityImprovements: z
    .array(z.object({ level: z.number().int().positive(), classRef: z.string(), abilities: z.partialRecord(AbilitySchema, z.number().int()) }))
    .default([]),
});
export type CharacterBuild = z.infer<typeof CharacterBuildSchema>;

const InventoryItemSchema = z.object({
  itemRef: z.string().optional(),
  inline: z.unknown().optional(), // ad-hoc ItemPayload for one-off items not worth a content entry
  qty: z.number().int().positive().default(1),
  equipped: z.boolean().default(false),
  attuned: z.boolean().default(false),
});

const CurrencySchema = z.object({
  cp: z.number().int().nonnegative().default(0),
  sp: z.number().int().nonnegative().default(0),
  ep: z.number().int().nonnegative().default(0),
  gp: z.number().int().nonnegative().default(0),
  pp: z.number().int().nonnegative().default(0),
});

const RollLogEntrySchema = z.object({
  id: z.string(),
  timestamp: z.number(),
  label: z.string(),
  formula: z.string(),
  rolls: z.array(z.number().int()),
  total: z.number().int(),
});

export const CharacterStateSchema = z.object({
  hp: z.object({
    current: z.number().int(),
    tempHp: z.number().int().nonnegative().default(0),
    overrideMax: z.number().int().positive().optional(),
  }),
  hitDiceSpent: z.record(z.string(), z.number().int().nonnegative()).default({}),
  conditions: z.array(z.object({ ref: z.string(), note: z.string().optional() })).default([]),
  exhaustion: z.number().int().min(0).max(6).default(0),
  deathSaves: z.object({
    successes: z.number().int().min(0).max(3).default(0),
    failures: z.number().int().min(0).max(3).default(0),
  }),
  spellSlotsSpent: z.array(z.number().int().nonnegative()).default([]),
  pactSlotsSpent: z.number().int().nonnegative().default(0),
  resourcesSpent: z.record(z.string(), z.number().int().nonnegative()).default({}),
  inventory: z.array(InventoryItemSchema).default([]),
  currency: CurrencySchema,
  concentratingOn: z.string().optional(),
  inspiration: z.boolean().default(false),
  /** Barbarian Rage — toggled on/off, adds rage_damage_bonus to Strength-based melee attacks while active. */
  raging: z.boolean().default(false),
  notes: z.string().default(''),
  /** Free text — language content isn't modeled yet, so this is user-edited rather than derived. */
  languages: z.string().default(''),
  alignment: z.string().default(''),
  personalityTraits: z.string().default(''),
  ideals: z.string().default(''),
  bonds: z.string().default(''),
  flaws: z.string().default(''),
  rollLog: z.array(RollLogEntrySchema).default([]),
});
export type CharacterState = z.infer<typeof CharacterStateSchema>;

export const CharacterSchema = z.object({
  id: z.string().min(1),
  edition: EditionSchema,
  name: z.string().min(1),
  createdAt: z.number(),
  updatedAt: z.number(),
  schemaVersion: z.number().int().positive(),
  build: CharacterBuildSchema,
  state: CharacterStateSchema,
});
export type Character = z.infer<typeof CharacterSchema>;
