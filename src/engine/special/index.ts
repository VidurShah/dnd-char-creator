import type { Ability } from '@/schema/common';

export interface SpecialRuleContext {
  abilityMods: Record<Ability, number>;
  prof: number;
  isWearingArmor: boolean;
  isWearingShield: boolean;
  classLevels: Record<string, number>;
}

export interface SpecialRuleContribution {
  /** An alternative AC formula this feature grants (e.g. Unarmored Defense). Max wins against other candidates. */
  acCandidate?: { value: number; label: string };
}

type SpecialRule = (ctx: SpecialRuleContext) => SpecialRuleContribution | undefined;

/**
 * Hardcoded escape hatch for mechanics too irregular for the Effect vocabulary
 * (src/schema/effects.ts). Rule of thumb: a mechanic needed by fewer than ~3
 * features gets a hardcoded entry here rather than a new Effect op.
 *
 * Keyed by the featureRef with its edition prefix stripped (see `lookupSpecialRule`),
 * since these mechanics are almost always the same rule wearing a different id
 * across editions — keying on the full ref meant 2024 Barbarians/Monks silently
 * got no Unarmored Defense at all. An edition genuinely differs? Add a full-ref
 * key to `editionSpecificRules`, which wins over the shared entry.
 */
export const specialRules: Record<string, SpecialRule> = {
  'feature/barbarian-unarmored-defense': (ctx) => {
    if (ctx.isWearingArmor) return undefined;
    return {
      acCandidate: { value: 10 + ctx.abilityMods.dex + ctx.abilityMods.con, label: 'Unarmored Defense (Barbarian)' },
    };
  },
  'feature/monk-unarmored-defense': (ctx) => {
    if (ctx.isWearingArmor || ctx.isWearingShield) return undefined;
    return {
      acCandidate: { value: 10 + ctx.abilityMods.dex + ctx.abilityMods.wis, label: 'Unarmored Defense (Monk)' },
    };
  },
};

/**
 * Overrides for the rare mechanic that genuinely differs between editions.
 * Keyed by the full featureRef (e.g. "2024/feature/..."), checked before the
 * edition-agnostic `specialRules` above. Empty today — kept so an edition delta
 * has an obvious home that doesn't require re-keying the shared registry.
 */
export const editionSpecificRules: Record<string, SpecialRule> = {};

/** Strips the leading edition segment ("2014/feature/x" -> "feature/x"). */
export function specialRuleKey(featureRef: string): string {
  return featureRef.replace(/^\d{4}\//, '');
}

/** Resolves a featureRef to its rule: exact edition-specific match first, then the shared slug. */
export function lookupSpecialRule(featureRef: string): SpecialRule | undefined {
  return editionSpecificRules[featureRef] ?? specialRules[specialRuleKey(featureRef)];
}
