import { beforeAll, describe, expect, it } from 'vitest';
import { loadContentIndex } from '@/content/loader';
import type { ContentEntry } from '@/schema/content';
import type { Character } from '@/schema/character';
import { enumerateDecisions, unresolvedDecisions } from './decisions';

let index: Map<string, ContentEntry>;

beforeAll(async () => {
  const entries = await loadContentIndex('2014');
  index = new Map(entries.map((e) => [e.id, e]));
});

function fighterCharacter(decisionsByLevel: Record<string, { decisionId: string; choice: string[] }[]>): Character {
  const now = Date.now();
  return {
    id: 'test',
    edition: '2014',
    name: 'Test',
    createdAt: now,
    updatedAt: now,
    schemaVersion: 1,
    build: {
      abilityMethod: 'manual',
      baseAbilities: { str: 15, dex: 13, con: 14, int: 10, wis: 12, cha: 8 },
      species: { ref: '2014/species/human', decisions: [] },
      background: { ref: '2014/background/acolyte', decisions: [] },
      classes: [{ classRef: '2014/class/fighter', levels: 1, decisionsByLevel }],
      levelOrder: [{ classRef: '2014/class/fighter' }],
      knownSpells: [],
      preparedSpells: [],
      feats: [],
      abilityImprovements: [],
    },
    state: {
      hp: { current: 1, tempHp: 0 },
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

describe('decisions engine', () => {
  it('surfaces the fighter skill choice as unresolved', () => {
    const character = fighterCharacter({});
    const unresolved = unresolvedDecisions(character, index);
    expect(unresolved).toContainEqual(
      expect.objectContaining({ decisionId: 'fighter/skills', count: 2, scope: 'class' }),
    );
  });

  it('no longer lists a decision once it has been recorded', () => {
    const character = fighterCharacter({
      '1': [{ decisionId: 'fighter/skills', choice: ['athletics', 'perception'] }],
    });
    const unresolved = unresolvedDecisions(character, index);
    expect(unresolved.find((d) => d.decisionId === 'fighter/skills')).toBeUndefined();

    // enumerateDecisions still reports it — only unresolvedDecisions filters recorded ones.
    const all = enumerateDecisions(character, index);
    expect(all.find((d) => d.decisionId === 'fighter/skills')).toBeDefined();
  });
});
