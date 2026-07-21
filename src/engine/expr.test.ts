import { describe, expect, it } from 'vitest';
import { evalExpr, type ExprContext } from './expr';

const ctx: ExprContext = {
  prof: 3,
  totalLevel: 9,
  classLevels: { fighter: 5, wizard: 4 },
  abilityMods: { str: 3, dex: 1, con: 2, int: -1, wis: 4, cha: 0 },
};

describe('evalExpr', () => {
  it('evaluates numeric literals and arithmetic', () => {
    expect(evalExpr('2 + 3', ctx)).toBe(5);
    expect(evalExpr('2 + 3 * 4', ctx)).toBe(14);
    expect(evalExpr('(2 + 3) * 4', ctx)).toBe(20);
    expect(evalExpr('-5 + 2', ctx)).toBe(-3);
    expect(evalExpr('10 / 4', ctx)).toBe(2.5);
  });

  it('resolves prof and level', () => {
    expect(evalExpr('prof', ctx)).toBe(3);
    expect(evalExpr('level', ctx)).toBe(9);
    expect(evalExpr('level()', ctx)).toBe(9);
    expect(evalExpr('level(fighter)', ctx)).toBe(5);
    expect(evalExpr('level(monk)', ctx)).toBe(0);
  });

  it('resolves ability modifiers via mod()', () => {
    expect(evalExpr('mod(wis)', ctx)).toBe(4);
    expect(evalExpr('mod(int)', ctx)).toBe(-1);
  });

  it('supports max/min/floor/ceil/abs', () => {
    expect(evalExpr('max(1, mod(cha))', ctx)).toBe(1);
    expect(evalExpr('max(1, mod(wis))', ctx)).toBe(4);
    expect(evalExpr('min(prof, 2)', ctx)).toBe(2);
    expect(evalExpr('floor(level/4)', ctx)).toBe(2);
    expect(evalExpr('ceil(level/4)', ctx)).toBe(3);
    expect(evalExpr('abs(-7)', ctx)).toBe(7);
  });

  it('composes realistic sheet formulas', () => {
    // Monk unarmored movement bonus: 2 + floor(level/4) * 5, etc. Simple composite check:
    expect(evalExpr('2 + floor(level/4)', ctx)).toBe(4);
    expect(evalExpr('prof + mod(wis)', ctx)).toBe(7);
  });

  it('throws on unknown identifiers and malformed input', () => {
    expect(() => evalExpr('foo', ctx)).toThrow();
    expect(() => evalExpr('mod(xyz)', ctx)).toThrow();
    expect(() => evalExpr('2 +', ctx)).toThrow();
    expect(() => evalExpr('2 $ 3', ctx)).toThrow();
  });
});
