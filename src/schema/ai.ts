import { z } from 'zod';
import { AbilitySchema } from './common';

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
  alignment: z.string().optional(),
  personalityTraits: z.string().optional(),
  ideals: z.string().optional(),
  bonds: z.string().optional(),
  flaws: z.string().optional(),
  notes: z.string().optional(),
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
});
export type ResolvedDecisions = z.infer<typeof ResolvedDecisionsSchema>;
