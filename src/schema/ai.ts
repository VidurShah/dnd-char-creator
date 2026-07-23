import { z } from 'zod';
import { AbilitySchema } from './common';

/** Short, per-choice explanations the model gives so the builder can show "why this pick" on each step. */
export const ConceptRationaleSchema = z.object({
  abilities: z.string().optional(),
  species: z.string().optional(),
  class: z.string().optional(),
  subclass: z.string().optional(),
  background: z.string().optional(),
  personality: z.string().optional(),
});
export type ConceptRationale = z.infer<typeof ConceptRationaleSchema>;

/** Turn 1 output: a high-level character concept, resolved against real content ids from the compact catalog the model was given. */
export const ProposedConceptSchema = z.object({
  name: z.string().min(1),
  speciesRef: z.string(),
  classRef: z.string(),
  subclassRef: z.string().optional(),
  backgroundRef: z.string(),
  level: z.number().int().min(1).max(20),
  /** All 6 abilities, ordered highest priority first — turned into a standard-array assignment. */
  abilityPriorities: z.array(AbilitySchema).length(6),
  /** Roleplaying/lore fields — the model fills these so the Personality step lands pre-written, not blank. */
  alignment: z.string().optional(),
  personalityTraits: z.string().optional(),
  ideals: z.string().optional(),
  bonds: z.string().optional(),
  flaws: z.string().optional(),
  notes: z.string().optional(),
  /** One or two sentences per choice explaining why, shown on the matching builder step. */
  rationale: ConceptRationaleSchema.optional(),
});
export type ProposedConcept = z.infer<typeof ProposedConceptSchema>;

/** Turn 2 output: answers to every decision the concept still leaves open (skills, feats-as-ASI aside, spells, equipment). */
export const ResolvedDecisionsSchema = z.object({
  decisions: z.array(z.object({ decisionId: z.string(), choice: z.array(z.string()) })),
  knownSpells: z.array(z.string()).default([]),
  featRefs: z.array(z.string()).default([]),
  /** Index into each of the class's startingEquipment.choices, in order. */
  equipmentChoicePicks: z.array(z.number().int().nonnegative()).default([]),
  takeStartingGold: z.boolean().default(false),
  /** Why these skills/spells/equipment/feats — shown on the Choices, Spells, Equipment, and Feats steps. */
  rationale: z
    .object({
      choices: z.string().optional(),
      spells: z.string().optional(),
      equipment: z.string().optional(),
      feats: z.string().optional(),
    })
    .optional(),
});
export type ResolvedDecisions = z.infer<typeof ResolvedDecisionsSchema>;
