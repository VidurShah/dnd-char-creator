import { beforeAll, describe, expect, it } from 'vitest';
import { loadContentIndex } from '@/content/loader';
import type { ContentEntry } from '@/schema/content';
import type { Effect } from '@/schema/effects';
import type { Character, CharacterBuild, CharacterState } from '@/schema/character';
import { computeSheet } from './compute';

/**
 * Exercises every effect op that isn't already covered by a real piece of
 * seed/extracted content (see CLAUDE.md's note on which ops are consumed).
 * Rather than requiring real content to carry these effects, each test
 * injects a synthetic feat with the effect(s) under test into a cloned
 * content index — this is the fastest way to prove the *engine* consumes an
 * op correctly, independent of whether any content author has used it yet.
 */

let baseIndex: Map<string, ContentEntry>;

beforeAll(async () => {
  const entries = await loadContentIndex('2014');
  baseIndex = new Map(entries.map((e) => [e.id, e]));
});

function withSyntheticFeat(effects: Effect[]): Map<string, ContentEntry> {
  const index = new Map(baseIndex);
  const feat: ContentEntry = {
    id: 'test/feat/synthetic',
    edition: '2014',
    kind: 'feat',
    name: 'Synthetic Test Feat',
    source: { book: 'custom' },
    origin: 'custom',
    schemaVersion: 1,
    effects,
    data: { description: 'A feat that only exists to carry test effects.' },
  };
  index.set(feat.id, feat);
  return index;
}

function baseCharacter(
  featRefs: string[] = ['test/feat/synthetic'],
  overrides: { build?: Partial<CharacterBuild>; state?: Partial<CharacterState> } = {},
): Character {
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
      baseAbilities: { str: 10, dex: 14, con: 12, int: 10, wis: 10, cha: 10 },
      species: { ref: '2014/species/human', decisions: [] },
      background: { ref: '2014/background/acolyte', decisions: [] },
      classes: [],
      levelOrder: [],
      knownSpells: [],
      preparedSpells: [],
      feats: featRefs.map((ref) => ({ ref, decisions: [] })),
      abilityImprovements: [],
      ...overrides.build,
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
      ...overrides.state,
    },
  };
}

describe('computeSheet — previously-unconsumed effect ops', () => {
  it('abilityMax caps a score even when bonuses would push it higher', () => {
    const index = withSyntheticFeat([
      { op: 'abilityBonus', ability: 'str', amount: '10' },
      { op: 'abilityMax', ability: 'str', max: 22 },
    ]);
    const sheet = computeSheet(baseCharacter(), index);
    expect(sheet.abilities.str.score).toBe(21); // 10 base + 1 (Human's +1 to every ability) + 10 bonus = 21, under the raised cap of 22 — not clamped
  });

  it('abilityMax clamps when the raised cap is actually exceeded', () => {
    const index = withSyntheticFeat([
      { op: 'abilityBonus', ability: 'str', amount: '15' },
      { op: 'abilityMax', ability: 'str', max: 22 },
    ]);
    const sheet = computeSheet(baseCharacter(), index);
    expect(sheet.abilities.str.score).toBe(22); // 10 + 15 = 25, clamped to the raised cap
  });

  it('proficiency effect grants skill/save/tool/weapon/armor proficiencies', () => {
    const index = withSyntheticFeat([
      { op: 'proficiency', domain: 'skill', keys: ['performance'] },
      { op: 'proficiency', domain: 'save', keys: ['int'] },
      { op: 'proficiency', domain: 'tool', keys: ['thieves-tools'] },
      { op: 'proficiency', domain: 'weapon', keys: ['longbow'] },
      { op: 'proficiency', domain: 'armor', keys: ['heavy-armor'] },
    ]);
    const sheet = computeSheet(baseCharacter(), index);
    expect(sheet.skills.performance?.proficient).toBe(true);
    expect(sheet.savingThrows.int.proficient).toBe(true);
    expect(sheet.proficiencies.tools).toContain('thieves-tools');
    expect(sheet.proficiencies.weapons).toContain('longbow');
    expect(sheet.proficiencies.armor).toContain('heavy-armor');
  });

  it('expertise doubles proficiency bonus on the listed (already-proficient) skill', () => {
    const index = withSyntheticFeat([
      { op: 'proficiency', domain: 'skill', keys: ['performance'] },
      { op: 'expertise', skills: ['performance'] },
    ]);
    const sheet = computeSheet(baseCharacter(), index);
    // cha 10 -> mod 0, prof bonus with no class levels is 1 -> doubled = 2
    expect(sheet.skills.performance?.mod).toBe(2);
  });

  it('acFormula adds a candidate AC and can disallow a shield bonus', () => {
    const index = withSyntheticFeat([{ op: 'acFormula', base: 13, addMods: ['dex'], allowShield: false }]);
    const character = baseCharacter();
    character.state.inventory = [{ itemRef: '2014/item/shield', qty: 1, equipped: true, attuned: false }];
    const sheet = computeSheet(character, index);
    // dex 14 -> mod +2; acFormula candidate = 13+2=15 beats unarmored 10+2=12
    expect(sheet.ac.value).toBe(15); // shield's +2 must NOT be added since allowShield: false
  });

  it('acFormula allows a shield bonus by default', () => {
    const index = withSyntheticFeat([{ op: 'acFormula', base: 13, addMods: ['dex'] }]);
    const character = baseCharacter();
    character.state.inventory = [{ itemRef: '2014/item/shield', qty: 1, equipped: true, attuned: false }];
    const sheet = computeSheet(character, index);
    expect(sheet.ac.value).toBe(17); // 13 + 2 (dex) + 2 (shield)
  });

  it('speed effect can override/boost walk speed and grant fly/swim/climb', () => {
    const index = withSyntheticFeat([
      { op: 'speed', mode: 'walk', bonus: '10' },
      { op: 'speed', mode: 'fly', set: 30 },
    ]);
    const sheet = computeSheet(baseCharacter(), index);
    expect(sheet.speed).toBe(40); // 30 base + 10 bonus
    expect(sheet.movementModes).toContainEqual({ mode: 'fly', value: 30 });
  });

  it('rollBonus on initiative folds into the derived initiative', () => {
    const index = withSyntheticFeat([{ op: 'rollBonus', on: ['initiative'], amount: '5' }]);
    const sheet = computeSheet(baseCharacter(), index);
    const without = computeSheet(baseCharacter(), baseIndex);
    expect(sheet.initiative).toBe(without.initiative + 5);
  });

  it('rollBonus on abilityCheck and skillCheck both fold into skill mods', () => {
    const character = baseCharacter(undefined, {
      build: {
        classes: [{ classRef: '2014/class/fighter', subclassRef: undefined, levels: 1, decisionsByLevel: { '1': [{ decisionId: 'fighter/skills', choice: ['athletics'] }] } }],
        levelOrder: [{ classRef: '2014/class/fighter' }],
      },
    });
    const without = computeSheet(character, baseIndex);

    const abilityOnly = computeSheet(character, withSyntheticFeat([{ op: 'rollBonus', on: ['abilityCheck'], amount: '2' }]));
    expect(abilityOnly.skills.athletics?.mod).toBe((without.skills.athletics?.mod ?? 0) + 2);

    const skillOnly = computeSheet(character, withSyntheticFeat([{ op: 'rollBonus', on: ['skillCheck'], amount: '3' }]));
    expect(skillOnly.skills.athletics?.mod).toBe((without.skills.athletics?.mod ?? 0) + 3);
  });

  it('resource effect adds a tracked pool with an evaluated max', () => {
    const index = withSyntheticFeat([{ op: 'resource', id: 'test/second-wind', max: '2', recharge: 'short' }]);
    const sheet = computeSheet(baseCharacter(), index);
    expect(sheet.resources.find((r) => r.id === 'test/second-wind')).toMatchObject({ label: 'Second Wind', max: 2, recharge: 'short' });
  });

  it('grantSpell + spellcasting effects give a non-caster a DC and an always-available spell, gated by minLevel', () => {
    const index = withSyntheticFeat([
      { op: 'spellcasting', progression: 'full', ability: 'cha' },
      { op: 'grantSpell', spellRef: '2014/spell/thaumaturgy', uses: 'atWill' },
      { op: 'grantSpell', spellRef: '2014/spell/hellish-rebuke', uses: 'perLong', minLevel: 3 },
    ]);
    const level1 = computeSheet(
      baseCharacter(['test/feat/synthetic'], {
        build: {
          classes: [{ classRef: '2014/class/fighter', subclassRef: undefined, levels: 1, decisionsByLevel: {} }],
          levelOrder: [{ classRef: '2014/class/fighter' }],
        },
      }),
      index,
    );
    expect(level1.spellcasting?.ability).toBe('cha');
    expect(level1.grantedSpellRefs).toContain('2014/spell/thaumaturgy');
    expect(level1.grantedSpellRefs).not.toContain('2014/spell/hellish-rebuke'); // minLevel 3, character is only level 1

    const level3 = computeSheet(
      baseCharacter(['test/feat/synthetic'], {
        build: {
          classes: [{ classRef: '2014/class/fighter', subclassRef: undefined, levels: 3, decisionsByLevel: {} }],
          levelOrder: [{ classRef: '2014/class/fighter' }, { classRef: '2014/class/fighter' }, { classRef: '2014/class/fighter' }],
        },
      }),
      index,
    );
    expect(level3.grantedSpellRefs).toContain('2014/spell/hellish-rebuke');
  });

  it('hpBonus adds flat and per-level bonus hit points', () => {
    const index = withSyntheticFeat([{ op: 'hpBonus', flat: '3', perLevel: '1' }]);
    const character = baseCharacter(['test/feat/synthetic'], {
      build: {
        classes: [{ classRef: '2014/class/fighter', subclassRef: undefined, levels: 4, decisionsByLevel: {} }],
        levelOrder: [
          { classRef: '2014/class/fighter' },
          { classRef: '2014/class/fighter' },
          { classRef: '2014/class/fighter' },
          { classRef: '2014/class/fighter' },
        ],
      },
    });
    const withoutBonus = computeSheet(baseCharacter([], { build: character.build }), baseIndex);
    const withBonus = computeSheet(character, index);
    expect(withBonus.hp.max).toBe(withoutBonus.hp.max + 3 + 1 * 4); // +3 flat, +1/level * 4 levels
  });

  it('sense effect adds a sense beyond the darkvision heuristic', () => {
    const index = withSyntheticFeat([{ op: 'sense', sense: 'blindsight', range: 10 }]);
    const sheet = computeSheet(baseCharacter(), index);
    expect(sheet.senses).toContainEqual({ sense: 'blindsight', range: 10 });
  });

  it('a class feature carrying effects is actually consumed (not just species/feat/item)', () => {
    const index = new Map(baseIndex);
    const featureId = '2014/feature/fighter-fighting-style';
    const original = index.get(featureId);
    if (original?.kind !== 'feature') throw new Error('fixture assumption broken: fighting-style feature missing');
    index.set(featureId, { ...original, effects: [{ op: 'rollBonus', on: ['attack'], amount: '2' }] });

    const character = baseCharacter([], {
      build: {
        classes: [{ classRef: '2014/class/fighter', subclassRef: undefined, levels: 1, decisionsByLevel: {} }],
        levelOrder: [{ classRef: '2014/class/fighter' }],
      },
    });
    character.state.inventory = [{ itemRef: '2014/item/longsword', qty: 1, equipped: true, attuned: false }];
    const sheet = computeSheet(character, index);
    const withoutEffect = computeSheet(character, baseIndex);
    expect(sheet.attacks[0].attackBonus).toBe(withoutEffect.attacks[0].attackBonus + 2);
  });
});
