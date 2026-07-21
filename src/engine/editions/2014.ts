/**
 * 2014 (PHB/SRD 5.1) exhaustion table (PHB p.291) — six cumulative levels,
 * each level's effects include all lower levels' effects.
 */
export interface Exhaustion2014Effects {
  abilityCheckDisadvantage: boolean; // level 1+
  speedMultiplier: number; // level 2+: halved; level 5+: zero
  attackAndSaveDisadvantage: boolean; // level 3+
  hpMaxMultiplier: number; // level 4+: halved
  dead: boolean; // level 6
}

export function exhaustionEffects2014(level: number): Exhaustion2014Effects {
  return {
    abilityCheckDisadvantage: level >= 1,
    speedMultiplier: level >= 5 ? 0 : level >= 2 ? 0.5 : 1,
    attackAndSaveDisadvantage: level >= 3,
    hpMaxMultiplier: level >= 4 ? 0.5 : 1,
    dead: level >= 6,
  };
}
