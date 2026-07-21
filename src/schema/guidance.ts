import { z } from 'zod';
import { AbilitySchema } from './common';

export const ClassGuidanceSchema = z.object({
  classRef: z.string(),
  recommendedAbilities: z.array(AbilitySchema),
  abilityRationale: z.string(),
  subclasses: z.array(z.object({ subclassRef: z.string(), rationale: z.string() })),
});
export type ClassGuidance = z.infer<typeof ClassGuidanceSchema>;
