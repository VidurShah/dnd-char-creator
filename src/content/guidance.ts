import type { Edition } from '@/schema/common';
import { ClassGuidanceSchema, type ClassGuidance } from '@/schema/guidance';
import guidance2014 from '@data/guidance/2014.json';
import guidance2024 from '@data/guidance/2024.json';

const PARSED: Record<Edition, ClassGuidance[]> = {
  '2014': (guidance2014 as unknown[]).map((g) => ClassGuidanceSchema.parse(g)),
  '2024': (guidance2024 as unknown[]).map((g) => ClassGuidanceSchema.parse(g)),
};

/** Beginner build advice for a class — recommended ability priority + top subclass picks with rationale. Hand-authored, not derived from character data. */
export function getClassGuidance(edition: Edition, classRef: string): ClassGuidance | undefined {
  return PARSED[edition].find((g) => g.classRef === classRef);
}
