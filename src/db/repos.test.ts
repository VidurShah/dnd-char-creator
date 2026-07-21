import { describe, expect, it } from 'vitest';
import { characterRepo, contentRepo } from './repos';
import type { Character } from '@/schema/character';
import type { ContentEntry } from '@/schema/content';

function makeFireball(): ContentEntry {
  return {
    id: '2014/spell/fireball',
    edition: '2014',
    kind: 'spell',
    name: 'Fireball',
    source: { book: 'SRD5.1', page: 241 },
    origin: 'seed',
    schemaVersion: 1,
    data: {
      level: 3,
      school: 'evocation',
      castingTime: '1 action',
      range: '150 feet',
      components: { verbal: true, somatic: true, material: 'a tiny ball of bat guano and sulfur' },
      duration: 'Instantaneous',
      concentration: false,
      ritual: false,
      classLists: ['sorcerer', 'wizard'],
      description: 'A bright streak flashes from your pointing finger to a point you choose.',
    },
  };
}

function makeCharacter(): Character {
  const now = Date.now();
  return {
    id: 'char-1',
    edition: '2014',
    name: 'Test Fighter',
    createdAt: now,
    updatedAt: now,
    schemaVersion: 1,
    build: {
      abilityMethod: 'standardArray',
      baseAbilities: { str: 15, dex: 14, con: 13, int: 12, wis: 10, cha: 8 },
      species: { ref: '2014/species/human', decisions: [] },
      background: { ref: '2014/background/soldier', decisions: [] },
      classes: [{ classRef: '2014/class/fighter', levels: 1, decisionsByLevel: {} }],
      levelOrder: [{ classRef: '2014/class/fighter' }],
      knownSpells: [],
      preparedSpells: [],
      feats: [],
      abilityImprovements: [],
    },
    state: {
      hp: { current: 11, tempHp: 0 },
      hitDiceSpent: {},
      conditions: [],
      exhaustion: 0,
      deathSaves: { successes: 0, failures: 0 },
      spellSlotsSpent: [],
      pactSlotsSpent: 0,
      resourcesSpent: {},
      inventory: [],
      currency: { cp: 0, sp: 0, ep: 0, gp: 10, pp: 0 },
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

describe('db repos', () => {
  it('round-trips a content entry through validation and storage', async () => {
    const fireball = makeFireball();
    await contentRepo.save(fireball);
    const fetched = await contentRepo.get(fireball.id);
    expect(fetched?.name).toBe('Fireball');
  });

  it('round-trips a character through validation and storage', async () => {
    const character = makeCharacter();
    await characterRepo.save(character);
    const fetched = await characterRepo.get(character.id);
    expect(fetched?.name).toBe('Test Fighter');
    expect(fetched?.state.hp.current).toBe(11);
  });
});
