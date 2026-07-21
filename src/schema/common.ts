import { z } from 'zod';

export const EditionSchema = z.enum(['2014', '2024']);
export type Edition = z.infer<typeof EditionSchema>;

export const AbilitySchema = z.enum(['str', 'dex', 'con', 'int', 'wis', 'cha']);
export type Ability = z.infer<typeof AbilitySchema>;

export const SkillSchema = z.enum([
  'acrobatics',
  'animalHandling',
  'arcana',
  'athletics',
  'deception',
  'history',
  'insight',
  'intimidation',
  'investigation',
  'medicine',
  'nature',
  'perception',
  'performance',
  'persuasion',
  'religion',
  'sleightOfHand',
  'stealth',
  'survival',
]);
export type Skill = z.infer<typeof SkillSchema>;

export const DamageTypeSchema = z.enum([
  'acid',
  'bludgeoning',
  'cold',
  'fire',
  'force',
  'lightning',
  'necrotic',
  'piercing',
  'poison',
  'psychic',
  'radiant',
  'slashing',
  'thunder',
]);
export type DamageType = z.infer<typeof DamageTypeSchema>;

/**
 * A whitelisted mini-expression string evaluated by src/engine/expr.ts.
 * Examples: "prof", "mod(wis)", "level(monk)", "2 + floor(level/4)", "max(1, mod(cha))"
 */
export const ExprSchema = z.string().min(1);
export type Expr = z.infer<typeof ExprSchema>;

/**
 * 'SRD5.1'/'SRD5.2' are the freely-licensed subsets the seed scripts pull from;
 * 'PHB2014'/'PHB2024'/'TCE' are the full sourcebooks. PHB2014 exists because the
 * SRD covers only a fraction of the 2014 book (one background, one feat), so
 * anything authored beyond it needs somewhere honest to attribute itself.
 */
export const SourceBookSchema = z.enum(['SRD5.1', 'SRD5.2', 'PHB2014', 'TCE', 'PHB2024', 'custom']);
export type SourceBook = z.infer<typeof SourceBookSchema>;

export const SourceSchema = z.object({
  book: SourceBookSchema,
  page: z.number().int().positive().optional(),
});
export type Source = z.infer<typeof SourceSchema>;

/** A single choice recorded during character building or leveling. */
export const DecisionSchema = z.object({
  decisionId: z.string().min(1),
  choice: z.union([z.string(), z.array(z.string()), z.number()]),
});
export type Decision = z.infer<typeof DecisionSchema>;

/** Declared by content (class/species/background/feat) so builder UI can render it generically. */
export const DecisionPointSchema = z.object({
  decisionId: z.string().min(1),
  prompt: z.string().min(1),
  count: z.number().int().positive().default(1),
  options: z.array(z.string()).optional(),
  optionQuery: z.string().optional(),
});
export type DecisionPoint = z.infer<typeof DecisionPointSchema>;
