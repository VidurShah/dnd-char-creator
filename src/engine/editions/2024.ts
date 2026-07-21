/**
 * 2024 (PHB) exhaustion rule (p.367) — simplified from 2014's tiered table into
 * a single stacking penalty: -2 to d20 Tests per level, -5 ft speed per level.
 * Still dies at level 6.
 */
export interface Exhaustion2024Effects {
  d20Penalty: number;
  speedReduction: number;
  dead: boolean;
}

export function exhaustionEffects2024(level: number): Exhaustion2024Effects {
  return {
    d20Penalty: -2 * level,
    speedReduction: 5 * level,
    dead: level >= 6,
  };
}

/** 2024 weapon mastery property descriptions (PHB p.216) — display-only for now;
 * see CLAUDE.md's note on effect-vocabulary scope for why this isn't mechanized. */
export const WEAPON_MASTERY_DESCRIPTIONS: Record<string, string> = {
  Cleave: "If you hit with this weapon, you can make a melee attack with it against a second creature within 5 feet of the first that's also within your reach, using the same roll (no extra ability modifier to the damage of the second hit).",
  Graze: "If your attack roll misses, you can deal damage to the target equal to the ability modifier you used to make the attack roll.",
  Nick: 'When making an extra attack from Light using this weapon, that extra attack is part of the same action instead of a bonus action (only usable once per turn).',
  Push: "If you hit, you can push the target up to 10 feet straight away from you, if it's Large or smaller.",
  Sap: 'If you hit, the target has disadvantage on its next attack roll before the start of your next turn.',
  Slow: "If you hit and deal damage, you can reduce the target's speed by 10 feet until the start of your next turn (no effect if it's already been slowed this way).",
  Topple: "If you hit, you can force the target to make a Constitution saving throw (DC = 8 + prof + relevant ability mod); on a failure, it's knocked prone.",
  Vex: "If you hit, you have advantage on your next attack roll against that same target before the end of your next turn.",
};
