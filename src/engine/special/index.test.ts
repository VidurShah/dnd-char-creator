import { beforeAll, describe, expect, it } from 'vitest';
import { loadContentIndex } from '@/content/loader';
import type { ContentEntry } from '@/schema/content';
import type { Character } from '@/schema/character';
import type { Edition } from '@/schema/common';
import { computeSheet } from '../compute';
import { specialRules, specialRuleKey, lookupSpecialRule } from './index';

const EDITIONS = ['2014', '2024'] as const;

let indexes: Record<Edition, Map<string, ContentEntry>>;

beforeAll(async () => {
  const entries = await Promise.all(EDITIONS.map((e) => loadContentIndex(e)));
  indexes = Object.fromEntries(
    EDITIONS.map((edition, i) => [edition, new Map(entries[i].map((e) => [e.id, e]))]),
  ) as Record<Edition, Map<string, ContentEntry>>;
});

/**
 * A monk/barbarian at level 1 with no armor equipped — the case Unarmored
 * Defense exists for. Ability scores are identical across editions so the two
 * editions' computed AC can be compared directly.
 */
function unarmoredCharacter(edition: Edition, klass: 'barbarian' | 'monk'): Character {
  const now = Date.now();
  return {
    id: `test-${edition}-${klass}`,
    edition,
    name: 'Test',
    createdAt: now,
    updatedAt: now,
    schemaVersion: 1,
    build: {
      abilityMethod: 'manual',
      baseAbilities: { str: 16, dex: 14, con: 16, int: 8, wis: 14, cha: 10 },
      species: { ref: `${edition}/species/human`, decisions: [] },
      background: { ref: `${edition}/background/acolyte`, decisions: [] },
      classes: [{ classRef: `${edition}/class/${klass}`, levels: 1, decisionsByLevel: {} }],
      levelOrder: [{ classRef: `${edition}/class/${klass}` }],
      knownSpells: [],
      preparedSpells: [],
      feats: [],
      abilityImprovements: [],
    },
    state: {
      hp: { current: 12, tempHp: 0 },
      hitDiceSpent: {},
      conditions: [],
      exhaustion: 0,
      deathSaves: { successes: 0, failures: 0 },
      spellSlotsSpent: [],
      pactSlotsSpent: 0,
      resourcesSpent: {},
      inventory: [],
      currency: { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 },
      inspiration: false,
      raging: false,
      notes: '',
      languages: '',
      alignment: '',
      personalityTraits: '',
      ideals: '',
      bonds: '',
      flaws: '',
      rollLog: [],
    },
  };
}

describe('specialRules registry', () => {
  // Guard against the bug this registry shipped with: keys were full featureRefs
  // with a "2014/" prefix, so every 2024 character silently matched nothing and
  // computed the wrong AC. A miss is invisible at runtime (optional chaining),
  // so it has to be caught here.
  it('every key resolves to a real feature id in both editions', () => {
    for (const key of Object.keys(specialRules)) {
      for (const edition of EDITIONS) {
        const entry = indexes[edition].get(`${edition}/${key}`);
        expect(entry, `${key} has no matching feature in ${edition}`).toBeDefined();
        expect(entry?.kind).toBe('feature');
      }
    }
  });

  it('strips the edition prefix when keying', () => {
    expect(specialRuleKey('2014/feature/monk-unarmored-defense')).toBe('feature/monk-unarmored-defense');
    expect(specialRuleKey('2024/feature/monk-unarmored-defense')).toBe('feature/monk-unarmored-defense');
  });

  it('resolves a rule for both editions of the same mechanic', () => {
    for (const edition of EDITIONS) {
      expect(lookupSpecialRule(`${edition}/feature/barbarian-unarmored-defense`)).toBeTypeOf('function');
      expect(lookupSpecialRule(`${edition}/feature/monk-unarmored-defense`)).toBeTypeOf('function');
    }
  });

  it('returns undefined for a ref with no rule', () => {
    expect(lookupSpecialRule('2014/feature/does-not-exist')).toBeUndefined();
  });
});

describe('Unarmored Defense — edition parity', () => {
  // Dex 14 (+2), Con 16 (+3), Wis 14 (+2).
  it.each(EDITIONS)('%s barbarian unarmored AC = 10 + 2 (dex) + 3 (con) = 15', (edition) => {
    const sheet = computeSheet(unarmoredCharacter(edition, 'barbarian'), indexes[edition]);
    expect(sheet.ac.value).toBe(15);
    expect(sheet.ac.sources.some((s) => s.label.includes('Unarmored Defense'))).toBe(true);
  });

  it.each(EDITIONS)('%s monk unarmored AC = 10 + 2 (dex) + 2 (wis) = 14', (edition) => {
    const sheet = computeSheet(unarmoredCharacter(edition, 'monk'), indexes[edition]);
    expect(sheet.ac.value).toBe(14);
    expect(sheet.ac.sources.some((s) => s.label.includes('Unarmored Defense'))).toBe(true);
  });
});
