import { describe, expect, it } from 'vitest';
import { parseDiceString, rollD20, rollDice, rollDie } from './dice';

describe('dice', () => {
  it('rollDie stays within [1, sides]', () => {
    for (let i = 0; i < 200; i++) {
      const r = rollDie(6);
      expect(r).toBeGreaterThanOrEqual(1);
      expect(r).toBeLessThanOrEqual(6);
    }
  });

  it('rollDice sums N dice plus modifier', () => {
    const { rolls, total } = rollDice(2, 6, 3);
    expect(rolls).toHaveLength(2);
    for (const r of rolls) expect(r).toBeGreaterThanOrEqual(1);
    expect(total).toBe(rolls[0] + rolls[1] + 3);
  });

  it('rollD20 advantage takes the higher roll', () => {
    for (let i = 0; i < 50; i++) {
      const { rolls, total } = rollD20('advantage', 5);
      expect(total).toBe(Math.max(...rolls) + 5);
    }
  });

  it('rollD20 disadvantage takes the lower roll', () => {
    for (let i = 0; i < 50; i++) {
      const { rolls, total } = rollD20('disadvantage', 2);
      expect(total).toBe(Math.min(...rolls) + 2);
    }
  });

  it('parseDiceString parses NdM', () => {
    expect(parseDiceString('1d8')).toEqual({ count: 1, sides: 8 });
    expect(parseDiceString('2d6')).toEqual({ count: 2, sides: 6 });
    expect(() => parseDiceString('bogus')).toThrow();
  });
});
