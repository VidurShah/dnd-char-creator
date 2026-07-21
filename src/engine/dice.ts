function randomInt(max: number): number {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return buf[0] % max;
}

export function rollDie(sides: number): number {
  return randomInt(sides) + 1;
}

export interface DiceRollResult {
  rolls: number[];
  modifier: number;
  total: number;
}

/** Rolls "NdM" (e.g. "2d6") plus a flat modifier. */
export function rollDice(count: number, sides: number, modifier = 0): DiceRollResult {
  const rolls = Array.from({ length: count }, () => rollDie(sides));
  const total = rolls.reduce((sum, r) => sum + r, 0) + modifier;
  return { rolls, modifier, total };
}

export type AdvantageMode = 'normal' | 'advantage' | 'disadvantage';

/** A single d20 roll (check/save/attack), honoring advantage/disadvantage, plus a modifier. */
export function rollD20(mode: AdvantageMode, modifier = 0): DiceRollResult {
  if (mode === 'normal') {
    const roll = rollDie(20);
    return { rolls: [roll], modifier, total: roll + modifier };
  }
  const a = rollDie(20);
  const b = rollDie(20);
  const chosen = mode === 'advantage' ? Math.max(a, b) : Math.min(a, b);
  return { rolls: [a, b], modifier, total: chosen + modifier };
}

/** Parses a damage-dice string like "1d8" or "2d6" into {count, sides}. */
export function parseDiceString(dice: string): { count: number; sides: number } {
  const match = /^(\d+)d(\d+)$/.exec(dice.trim());
  if (!match) throw new Error(`Invalid dice string "${dice}"`);
  return { count: Number(match[1]), sides: Number(match[2]) };
}
