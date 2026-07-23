import { describe, expect, it } from 'vitest';
import { CharacterStateSchema } from '@/schema/character';
import { nextSlotsSpent } from './sheetActions';

/** A dense array with no holes is the whole point — a hole serializes to null and
 * fails CharacterStateSchema on save, which silently dropped the slot write. */
function isDenseNumberArray(arr: number[]): boolean {
  if (arr.length !== Object.keys(arr).length) return false; // holes shrink the key count
  return arr.every((n) => typeof n === 'number');
}

describe('nextSlotsSpent', () => {
  it('spending a level-1 slot from empty yields a dense, schema-valid array', () => {
    const out = nextSlotsSpent([], 1, 0);
    expect(out).toEqual([0, 1]);
    expect(isDenseNumberArray(out)).toBe(true);
    // The failing case before the fix: this must parse.
    expect(CharacterStateSchema.shape.spellSlotsSpent.safeParse(out).success).toBe(true);
  });

  it('spends successive slots and refunds without going negative', () => {
    let s: number[] = [];
    s = nextSlotsSpent(s, 1, 0);
    s = nextSlotsSpent(s, 1, 1);
    expect(s[1]).toBe(2);
    s = nextSlotsSpent(s, 1, 0); // click a spent dot to refund
    expect(s[1]).toBe(1);
    s = nextSlotsSpent(s, 1, 0);
    expect(s[1]).toBe(0);
  });

  it('fills gaps when a higher-level slot is spent first', () => {
    const out = nextSlotsSpent([], 3, 0);
    expect(out).toEqual([0, 0, 0, 1]);
    expect(isDenseNumberArray(out)).toBe(true);
    expect(CharacterStateSchema.shape.spellSlotsSpent.safeParse(out).success).toBe(true);
  });
});
