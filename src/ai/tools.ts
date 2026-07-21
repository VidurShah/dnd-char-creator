import { z } from 'zod';
import { ProposedConceptSchema, ResolvedDecisionsSchema } from '@/schema/ai';
import type { ToolDef } from './geminiClient';

export const PROPOSE_CONCEPT_TOOL: ToolDef = {
  name: 'propose_concept',
  description:
    "Propose a D&D character concept — species, class, subclass (if applicable), background, level, and ability priorities — using ONLY the ids from the catalog you were given. Never invent an id.",
  inputSchema: z.toJSONSchema(ProposedConceptSchema),
};

export const RESOLVE_DECISIONS_TOOL: ToolDef = {
  name: 'resolve_decisions',
  description:
    'Resolve every open decision for this character build (skill choices, spells known/prepared, equipment) using ONLY the option ids/refs you were given. Never invent an id.',
  inputSchema: z.toJSONSchema(ResolvedDecisionsSchema),
};
