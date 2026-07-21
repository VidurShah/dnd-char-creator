import { z } from 'zod';
import { AbilitySchema, DamageTypeSchema, ExprSchema } from './common';

/**
 * Roll types a `rollBonus` effect can modify. Every tag here is folded in by
 * `computeSheet()` — do not add one speculatively. A tag the engine ignores
 * validates fine and then silently does nothing, which is worse than not
 * offering it ('damage' lived here unimplemented and was removed rather than
 * left as a trap; it needs per-attack plumbing that doesn't exist yet).
 *
 * `abilityCheck` and `skillCheck` both land on `DerivedSkill.mod` and are
 * currently equivalent — `rollBonus` has no field to scope a bonus to specific
 * skills, so neither can be narrowed. Both are kept because they read
 * differently at the content-authoring site; if a per-skill bonus is ever
 * needed, that's a `skills` field on this op, not a new tag.
 */
const RollTagSchema = z.enum([
  'attack',
  'abilityCheck',
  'savingThrow',
  'skillCheck',
  'initiative',
]);

/**
 * The closed effect vocabulary. Rule of thumb (see CLAUDE.md): a mechanic
 * needed by fewer than ~3 features gets hardcoded in src/engine/special
 * instead of growing this union.
 */
export const EffectSchema = z.discriminatedUnion('op', [
  z.object({ op: z.literal('abilityBonus'), ability: AbilitySchema, amount: ExprSchema }),
  z.object({ op: z.literal('abilityMax'), ability: AbilitySchema, max: z.number().int() }),
  z.object({
    op: z.literal('proficiency'),
    domain: z.enum(['skill', 'save', 'tool', 'weapon', 'armor']),
    keys: z.array(z.string()),
  }),
  z.object({ op: z.literal('expertise'), skills: z.array(z.string()) }),
  z.object({
    op: z.literal('acFormula'),
    base: z.number().int(),
    addMods: z.array(AbilitySchema),
    allowShield: z.boolean().optional(),
  }),
  z.object({ op: z.literal('acBonus'), amount: ExprSchema }),
  z.object({
    op: z.literal('speed'),
    mode: z.enum(['walk', 'fly', 'swim', 'climb']),
    set: z.number().int().optional(),
    bonus: ExprSchema.optional(),
  }),
  z.object({
    op: z.literal('resource'),
    id: z.string(),
    max: z.union([ExprSchema, z.literal('byLevelTable')]),
    recharge: z.enum(['short', 'long', 'none']),
  }),
  z.object({
    op: z.literal('spellcasting'),
    progression: z.enum(['full', 'half', 'third', 'pact']),
    ability: AbilitySchema,
  }),
  z.object({
    op: z.literal('grantSpell'),
    spellRef: z.string(),
    uses: z.enum(['atWill', 'perLong']).optional(),
    /** Character total level this grant becomes available at (e.g. a racial spell gained at level 3). Defaults to 1 — always available. */
    minLevel: z.number().int().positive().optional(),
  }),
  z.object({ op: z.literal('resistance'), damageTypes: z.array(DamageTypeSchema) }),
  z.object({ op: z.literal('sense'), sense: z.string(), range: z.number().int().positive() }),
  z.object({
    op: z.literal('rollBonus'),
    on: z.array(RollTagSchema),
    amount: ExprSchema,
  }),
  z.object({
    op: z.literal('hpBonus'),
    perLevel: ExprSchema.optional(),
    flat: ExprSchema.optional(),
  }),
]);

export type Effect = z.infer<typeof EffectSchema>;
