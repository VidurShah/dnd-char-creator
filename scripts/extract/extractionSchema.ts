import { z } from 'zod';

/**
 * A model-friendly FLAT shape for extracted entries — deliberately not the
 * nested discriminated-union ContentEntry shape, since that's much harder for
 * a JSON-schema-constrained model to fill reliably. validate.ts maps each
 * candidate into a real ContentEntry per kind and re-validates against the
 * app's actual Zod schemas before anything is treated as usable.
 *
 * Per the extraction pipeline design: never ask the model for `effects` —
 * only prose + structured stat fields. Effects get hand-authored later for
 * anything worth automating (see KNOWN_ITEM_EFFECTS pattern in the seed
 * scripts for the precedent).
 */
export const ExtractionCandidateSchema = z.object({
  name: z.string().min(1),
  kind: z.enum(['spell', 'item', 'feat', 'feature', 'background', 'species']),
  page: z.number().int().positive(),
  verbatimQuote: z.string().min(1),
  confidence: z.number().min(0).max(1),
  description: z.string(),

  // Spell fields
  level: z.number().int().min(0).max(9).optional(),
  school: z.string().optional(),
  castingTime: z.string().optional(),
  range: z.string().optional(),
  verbal: z.boolean().optional(),
  somatic: z.boolean().optional(),
  material: z.string().optional(),
  duration: z.string().optional(),
  concentration: z.boolean().optional(),
  ritual: z.boolean().optional(),
  classLists: z.array(z.string()).optional(),
  higherLevels: z.string().optional(),

  // Item fields
  category: z.string().optional(),
  rarity: z.string().optional(),
  costGp: z.number().optional(),
  weight: z.number().optional(),
  attunement: z.boolean().optional(),

  // Feat fields
  prerequisite: z.string().optional(),
});
export type ExtractionCandidate = z.infer<typeof ExtractionCandidateSchema>;

export const EmitEntriesArgsSchema = z.object({
  entries: z.array(ExtractionCandidateSchema),
});
