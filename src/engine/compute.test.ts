import { beforeAll, describe, expect, it } from 'vitest';
import { loadContentIndex } from '@/content/loader';
import type { ContentEntry } from '@/schema/content';
import type { Character, CharacterBuild, CharacterState } from '@/schema/character';
import { computeSheet } from './compute';

let index: Map<string, ContentEntry>;
let index2024: Map<string, ContentEntry>;

beforeAll(async () => {
  const entries = await loadContentIndex('2014');
  index = new Map(entries.map((e) => [e.id, e]));
  const entries2024 = await loadContentIndex('2024');
  index2024 = new Map(entries2024.map((e) => [e.id, e]));
});

function baseCharacter(overrides: { build?: Partial<CharacterBuild>; state?: Partial<CharacterState> }): Character {
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
      baseAbilities: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
      species: { ref: '2014/species/human', decisions: [] },
      background: { ref: '2014/background/acolyte', decisions: [] },
      classes: [],
      levelOrder: [],
      knownSpells: [],
      preparedSpells: [],
      feats: [],
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

describe('computeSheet — golden characters', () => {
  it('Fighter 5, Human, chain mail + shield + longsword', () => {
    const character = baseCharacter({
      build: {
        abilityMethod: 'manual',
        baseAbilities: { str: 15, dex: 13, con: 14, int: 10, wis: 12, cha: 8 },
        species: { ref: '2014/species/human', decisions: [] },
        background: { ref: '2014/background/acolyte', decisions: [] },
        classes: [
          {
            classRef: '2014/class/fighter',
            subclassRef: '2014/subclass/champion',
            levels: 5,
            decisionsByLevel: { '1': [{ decisionId: 'fighter/skills', choice: ['athletics', 'perception'] }] },
          },
        ],
        levelOrder: Array.from({ length: 5 }, () => ({ classRef: '2014/class/fighter' })),
        knownSpells: [],
        preparedSpells: [],
        feats: [{ ref: '2014/feat/grappler', decisions: [] }],
      },
      state: {
        hp: { current: 44, tempHp: 0 },
        hitDiceSpent: {},
        conditions: [],
        exhaustion: 0,
        deathSaves: { successes: 0, failures: 0 },
        spellSlotsSpent: [],
        pactSlotsSpent: 0,
        resourcesSpent: {},
        inventory: [
          { itemRef: '2014/item/chain-mail', qty: 1, equipped: true, attuned: false },
          { itemRef: '2014/item/shield', qty: 1, equipped: true, attuned: false },
          { itemRef: '2014/item/longsword', qty: 1, equipped: true, attuned: false },
        ],
        currency: { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 },
        inspiration: false,
      raging: false,
        notes: '',
        languages: '',
        rollLog: [],
      },
    });

    const sheet = computeSheet(character, index);

    expect(sheet.proficiencyBonus).toBe(3);
    expect(sheet.abilities.str.score).toBe(16);
    expect(sheet.abilities.str.mod).toBe(3);
    expect(sheet.abilities.dex.mod).toBe(2);
    expect(sheet.abilities.con.mod).toBe(2);
    expect(sheet.ac.value).toBe(18); // chain mail 16 (no dex) + shield 2
    expect(sheet.hp.max).toBe(44); // 10+2 at L1, (6+2)*4 for L2-5
    expect(sheet.savingThrows.str).toEqual({ mod: 6, proficient: true });
    expect(sheet.savingThrows.con).toEqual({ mod: 5, proficient: true });
    expect(sheet.savingThrows.wis.proficient).toBe(false);
    expect(sheet.skills.athletics).toEqual({ mod: 6, proficient: true });
    expect(sheet.skills.perception).toEqual({ mod: 4, proficient: true });
    expect(sheet.skills.insight).toEqual({ mod: 4, proficient: true }); // from Acolyte background
    expect(sheet.skills.religion).toEqual({ mod: 3, proficient: true });
    expect(sheet.attacks).toEqual([
      { itemRef: '2014/item/longsword', name: 'Longsword', attackBonus: 6, damageDice: '1d8', damageBonus: 3, damageType: 'slashing' },
    ]);
    expect(sheet.speed).toBe(30);
    expect(sheet.passivePerception).toBe(14); // 10 + perception mod (4)
    expect(sheet.senses).toEqual([]); // humans have no darkvision
    expect(sheet.features.find((f) => f.ref === '2014/subclass/champion')).toMatchObject({ source: 'subclass' });
    expect(sheet.features.find((f) => f.name === 'Improved Critical')).toMatchObject({ source: 'subclass' });
    expect(sheet.features.find((f) => f.ref === '2014/feat/grappler')).toMatchObject({ source: 'feat' });
  });

  it('Cleric 3, Dwarf, scale mail + shield', () => {
    const character = baseCharacter({
      build: {
        abilityMethod: 'manual',
        baseAbilities: { str: 14, dex: 10, con: 14, int: 8, wis: 16, cha: 10 },
        species: { ref: '2014/species/dwarf', decisions: [] },
        background: { ref: '2014/background/acolyte', decisions: [] },
        classes: [
          {
            classRef: '2014/class/cleric',
            levels: 3,
            decisionsByLevel: { '1': [{ decisionId: 'cleric/skills', choice: ['medicine', 'persuasion'] }] },
          },
        ],
        levelOrder: Array.from({ length: 3 }, () => ({ classRef: '2014/class/cleric' })),
        knownSpells: [],
        preparedSpells: [],
        feats: [],
      },
      state: {
        hp: { current: 27, tempHp: 0 },
        hitDiceSpent: {},
        conditions: [],
        exhaustion: 0,
        deathSaves: { successes: 0, failures: 0 },
        spellSlotsSpent: [],
        pactSlotsSpent: 0,
        resourcesSpent: {},
        inventory: [
          { itemRef: '2014/item/scale-mail', qty: 1, equipped: true, attuned: false },
          { itemRef: '2014/item/shield', qty: 1, equipped: true, attuned: false },
        ],
        currency: { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 },
        inspiration: false,
      raging: false,
        notes: '',
        languages: '',
        rollLog: [],
      },
    });

    const sheet = computeSheet(character, index);

    expect(sheet.proficiencyBonus).toBe(2);
    expect(sheet.abilities.con.score).toBe(16); // 14 + dwarf +2
    expect(sheet.abilities.wis.mod).toBe(3);
    expect(sheet.ac.value).toBe(16); // scale mail 14 + shield 2 (dex mod 0)
    expect(sheet.hp.max).toBe(27); // 8+3 at L1, (5+3)*2 for L2-3
    expect(sheet.savingThrows.wis).toEqual({ mod: 5, proficient: true });
    expect(sheet.savingThrows.cha).toEqual({ mod: 2, proficient: true });
    expect(sheet.skills.medicine).toEqual({ mod: 5, proficient: true });
    expect(sheet.skills.persuasion).toEqual({ mod: 2, proficient: true });
    expect(sheet.skills.insight).toEqual({ mod: 5, proficient: true }); // background
    expect(sheet.spellcasting).toBeDefined();
    expect(sheet.spellcasting?.ability).toBe('wis');
    expect(sheet.spellcasting?.saveDc).toBe(13);
    expect(sheet.spellcasting?.attackBonus).toBe(5);
    expect(sheet.spellcasting?.slots.slice(0, 4)).toEqual([0, 4, 2, 0]);
    expect(sheet.spellcasting?.cantripsKnown).toBe(3);
    expect(sheet.speed).toBe(25);
    expect(sheet.senses).toEqual([{ sense: 'darkvision', range: 60 }]); // dwarves have darkvision
    expect(sheet.features.some((f) => f.source === 'species')).toBe(true);
    expect(sheet.features.find((f) => f.name === 'Shelter of the Faithful')).toMatchObject({ source: 'background' });
  });

  it('Barbarian 4, Human, unarmored (Unarmored Defense) + greataxe', () => {
    const character = baseCharacter({
      build: {
        abilityMethod: 'manual',
        baseAbilities: { str: 15, dex: 14, con: 15, int: 8, wis: 10, cha: 8 },
        species: { ref: '2014/species/human', decisions: [] },
        background: { ref: '2014/background/acolyte', decisions: [] },
        classes: [
          {
            classRef: '2014/class/barbarian',
            levels: 4,
            decisionsByLevel: { '1': [{ decisionId: 'barbarian/skills', choice: ['survival', 'intimidation'] }] },
          },
        ],
        levelOrder: Array.from({ length: 4 }, () => ({ classRef: '2014/class/barbarian' })),
        knownSpells: [],
        preparedSpells: [],
        feats: [],
      },
      state: {
        hp: { current: 45, tempHp: 0 },
        hitDiceSpent: {},
        conditions: [],
        exhaustion: 0,
        deathSaves: { successes: 0, failures: 0 },
        spellSlotsSpent: [],
        pactSlotsSpent: 0,
        resourcesSpent: {},
        inventory: [{ itemRef: '2014/item/greataxe', qty: 1, equipped: true, attuned: false }],
        currency: { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 },
        inspiration: false,
      raging: false,
        notes: '',
        languages: '',
        rollLog: [],
      },
    });

    const sheet = computeSheet(character, index);

    expect(sheet.proficiencyBonus).toBe(2);
    expect(sheet.abilities.str.score).toBe(16);
    expect(sheet.abilities.con.mod).toBe(3);
    expect(sheet.ac.value).toBe(15); // Unarmored Defense: 10 + dex(2) + con(3)
    expect(sheet.hp.max).toBe(45); // 12+3 at L1, (7+3)*3 for L2-4
    expect(sheet.savingThrows.str).toEqual({ mod: 5, proficient: true });
    expect(sheet.savingThrows.con).toEqual({ mod: 5, proficient: true });
    expect(sheet.skills.survival).toEqual({ mod: 2, proficient: true });
    expect(sheet.skills.intimidation).toEqual({ mod: 1, proficient: true });
    expect(sheet.attacks).toEqual([
      { itemRef: '2014/item/greataxe', name: 'Greataxe', attackBonus: 5, damageDice: '1d12', damageBonus: 3, damageType: 'slashing' },
    ]);
    expect(sheet.resources.find((r) => r.id === 'barbarian/rage_count')).toMatchObject({ label: 'Rages', max: 3, recharge: 'long' });
    expect(sheet.speed).toBe(30);

    const ragingSheet = computeSheet({ ...character, state: { ...character.state, raging: true } }, index);
    expect(ragingSheet.attacks[0].damageBonus).toBe(5); // 3 (str) + 2 (rage_damage_bonus)
  });

  it('Rogue exposes Sneak Attack dice separately from attack damage; Monk gets an Unarmed Strike option', () => {
    const rogue = baseCharacter({
      build: {
        classes: [{ classRef: '2014/class/rogue', levels: 1, decisionsByLevel: {} }],
        levelOrder: [{ classRef: '2014/class/rogue' }],
      },
    });
    expect(computeSheet(rogue, index).sneakAttackDice).toBe('1d6');

    const monk = baseCharacter({
      build: {
        baseAbilities: { str: 10, dex: 16, con: 10, int: 10, wis: 10, cha: 10 },
        classes: [{ classRef: '2014/class/monk', levels: 1, decisionsByLevel: {} }],
        levelOrder: [{ classRef: '2014/class/monk' }],
      },
    });
    const monkSheet = computeSheet(monk, index);
    const unarmed = monkSheet.attacks.find((a) => a.itemRef === 'unarmed-strike');
    expect(unarmed).toMatchObject({ name: 'Unarmed Strike', damageDice: '1d4', damageType: 'bludgeoning', damageBonus: 3 }); // dex mod (3) beats str mod (0)
  });

  it('Fighter with the Dueling fighting style gets +2 damage wielding a single one-handed melee weapon', () => {
    const character = baseCharacter({
      build: {
        baseAbilities: { str: 15, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
        classes: [
          {
            classRef: '2014/class/fighter',
            levels: 1,
            decisionsByLevel: { '1': [{ decisionId: 'fighter/fighting-style', choice: ['Dueling'] }] },
          },
        ],
        levelOrder: [{ classRef: '2014/class/fighter' }],
      },
      state: { inventory: [{ itemRef: '2014/item/longsword', qty: 1, equipped: true, attuned: false }] },
    });
    const sheet = computeSheet(character, index);
    expect(sheet.attacks[0].damageBonus).toBe(5); // str mod (3, incl. Human's +1) + Dueling (2)
  });

  it('Ring of Protection only applies its +1 AC/saves while attuned', () => {
    const character = baseCharacter({
      build: {
        abilityMethod: 'manual',
        baseAbilities: { str: 10, dex: 12, con: 10, int: 10, wis: 10, cha: 10 },
        species: { ref: '2014/species/human', decisions: [] },
        background: { ref: '2014/background/acolyte', decisions: [] },
        classes: [{ classRef: '2014/class/fighter', levels: 1, decisionsByLevel: {} }],
        levelOrder: [{ classRef: '2014/class/fighter' }],
        knownSpells: [],
        preparedSpells: [],
        feats: [],
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
        inventory: [{ itemRef: '2014/item/ring-of-protection', qty: 1, equipped: true, attuned: false }],
        currency: { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 },
        inspiration: false,
      raging: false,
        notes: '',
        languages: '',
        rollLog: [],
      },
    });

    const unattuned = computeSheet(character, index);
    expect(unattuned.ac.value).toBe(11); // 10 + dex(1), ring not attuned so no bonus
    expect(unattuned.savingThrows.wis.mod).toBe(0);

    const attuned = {
      ...character,
      state: { ...character.state, inventory: [{ itemRef: '2014/item/ring-of-protection', qty: 1, equipped: true, attuned: true }] },
    };
    const sheet = computeSheet(attuned, index);
    expect(sheet.ac.value).toBe(12); // 10 + dex(1) + ring(1)
    expect(sheet.savingThrows.str.mod).toBe(3); // fighter is proficient: 0 (mod) + 2 (prof) + 1 (ring)
    expect(sheet.savingThrows.wis.mod).toBe(1); // not proficient: just the ring's +1
  });

  it('Multiclass Cleric 3 / Wizard 2 pools spell slots via the combined caster-level table', () => {
    const character = baseCharacter({
      build: {
        abilityMethod: 'manual',
        baseAbilities: { str: 10, dex: 10, con: 12, int: 14, wis: 16, cha: 10 },
        species: { ref: '2014/species/human', decisions: [] },
        background: { ref: '2014/background/acolyte', decisions: [] },
        classes: [
          { classRef: '2014/class/cleric', levels: 3, decisionsByLevel: {} },
          { classRef: '2014/class/wizard', levels: 2, decisionsByLevel: {} },
        ],
        levelOrder: [
          ...Array.from({ length: 3 }, () => ({ classRef: '2014/class/cleric' })),
          ...Array.from({ length: 2 }, () => ({ classRef: '2014/class/wizard' })),
        ],
        knownSpells: [],
        preparedSpells: [],
        feats: [],
      },
    });

    const sheet = computeSheet(character, index);

    expect(sheet.totalLevel).toBe(5);
    expect(sheet.proficiencyBonus).toBe(3); // by total level, not per-class
    // Combined caster level 3+2=5 -> multiclass table row [4,3,2] for slot levels 1-3.
    expect(sheet.spellcasting?.slots.slice(0, 4)).toEqual([0, 4, 3, 2]);
    expect(sheet.spellcasting?.cantripsKnown).toBe(6); // cleric (3) + wizard (3) at their own levels
    expect(sheet.spellcasting?.pactSlots).toBeUndefined();
  });

  it('Multiclass Sorcerer 3 / Warlock 2 keeps Pact Magic as a separate pool', () => {
    const character = baseCharacter({
      build: {
        abilityMethod: 'manual',
        baseAbilities: { str: 10, dex: 10, con: 12, int: 10, wis: 10, cha: 16 },
        species: { ref: '2014/species/human', decisions: [] },
        background: { ref: '2014/background/acolyte', decisions: [] },
        classes: [
          { classRef: '2014/class/sorcerer', levels: 3, decisionsByLevel: {} },
          { classRef: '2014/class/warlock', levels: 2, decisionsByLevel: {} },
        ],
        levelOrder: [
          ...Array.from({ length: 3 }, () => ({ classRef: '2014/class/sorcerer' })),
          ...Array.from({ length: 2 }, () => ({ classRef: '2014/class/warlock' })),
        ],
        knownSpells: [],
        preparedSpells: [],
        feats: [],
      },
    });

    const sheet = computeSheet(character, index);

    // Only one non-pact caster (Sorcerer) -> uses its own accurate level-3 table, not the
    // combined-level formula.
    expect(sheet.spellcasting?.slots.slice(0, 3)).toEqual([0, 4, 2]);
    expect(sheet.spellcasting?.cantripsKnown).toBe(4); // sorcerer's own cantrips at level 3
    expect(sheet.spellcasting?.pactSlots).toEqual({ level: 1, count: 2 }); // warlock 2's own Pact Magic
  });

  it('2024 Cleric 1, Human, Acolyte — background ability allocation + granted Origin feat', () => {
    const character: Character = {
      id: 'test-2024',
      edition: '2024',
      name: 'Test 2024 Cleric',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      schemaVersion: 1,
      build: {
        abilityMethod: 'manual',
        baseAbilities: { str: 10, dex: 10, con: 14, int: 8, wis: 14, cha: 10 },
        species: { ref: '2024/species/human', decisions: [] },
        background: {
          ref: '2024/background/acolyte',
          decisions: [{ decisionId: 'background/ability-scores', choice: ['wis:2', 'int:1'] }],
        },
        classes: [
          {
            classRef: '2024/class/cleric',
            levels: 1,
            decisionsByLevel: { '1': [{ decisionId: 'cleric/skills', choice: ['insight', 'religion'] }] },
          },
        ],
        levelOrder: [{ classRef: '2024/class/cleric' }],
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

    const sheet = computeSheet(character, index2024);

    // 2024 species grant no ability bonuses at all — only the background allocation applies.
    expect(sheet.abilities.wis.score).toBe(16); // 14 base + 2 from background
    expect(sheet.abilities.int.score).toBe(9); // 8 base + 1 from background
    expect(sheet.abilities.str.score).toBe(10); // untouched

    // Acolyte auto-grants Magic Initiate (Cleric) as an Origin feat, even though build.feats is empty.
    expect(sheet.features.find((f) => f.name === 'Magic Initiate')).toMatchObject({ source: 'feat' });
  });

  it('2014 exhaustion: level 3 halves speed and flags attack/save + ability-check disadvantage, level 4 also halves max HP', () => {
    const fighter = {
      classRef: '2014/class/fighter',
      subclassRef: undefined,
      levels: 5,
      decisionsByLevel: {},
    };
    const level3 = baseCharacter({
      build: { classes: [fighter], levelOrder: [{ classRef: '2014/class/fighter' }] },
      state: { exhaustion: 3 },
    });
    const sheetLevel3 = computeSheet(level3, index);
    expect(sheetLevel3.speed).toBe(15); // 30 halved
    expect(sheetLevel3.exhaustionDisadvantage).toEqual({ abilityChecks: true, attacksAndSaves: true });
    const hpWithoutExhaustion = computeSheet(baseCharacter({ build: { classes: [fighter], levelOrder: [{ classRef: '2014/class/fighter' }] } }), index).hp.max;
    expect(sheetLevel3.hp.max).toBe(hpWithoutExhaustion); // not halved yet at level 3

    const level4 = baseCharacter({
      build: { classes: [fighter], levelOrder: [{ classRef: '2014/class/fighter' }] },
      state: { exhaustion: 4 },
    });
    const sheetLevel4 = computeSheet(level4, index);
    expect(sheetLevel4.hp.max).toBe(Math.floor(hpWithoutExhaustion / 2));
  });

  it('2024 exhaustion: flat -2/level d20 penalty on saves/skills/attacks, -5ft/level speed', () => {
    function make2024Cleric(exhaustion: number): Character {
      return {
        id: 'test-2024-exhaustion',
        edition: '2024',
        name: 'Test',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        schemaVersion: 1,
        build: {
          abilityMethod: 'manual',
          baseAbilities: { str: 10, dex: 10, con: 14, int: 8, wis: 14, cha: 10 },
          species: { ref: '2024/species/human', decisions: [] },
          background: { ref: '2024/background/acolyte', decisions: [] },
          classes: [
            {
              classRef: '2024/class/cleric',
              levels: 1,
              decisionsByLevel: { '1': [{ decisionId: 'cleric/skills', choice: ['insight', 'religion'] }] },
            },
          ],
          levelOrder: [{ classRef: '2024/class/cleric' }],
          knownSpells: [],
          preparedSpells: [],
          feats: [],
          abilityImprovements: [],
        },
        state: {
          hp: { current: 1, tempHp: 0 },
          hitDiceSpent: {},
          conditions: [],
          exhaustion,
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

    const baseline = computeSheet(make2024Cleric(0), index2024);
    const sheet = computeSheet(make2024Cleric(2), index2024);
    expect(sheet.speed).toBe(baseline.speed - 10);
    expect(sheet.savingThrows.wis.mod).toBe(baseline.savingThrows.wis.mod - 4);
    expect(sheet.skills.religion?.mod).toBe(baseline.skills.religion!.mod - 4);
    expect(sheet.exhaustionDisadvantage).toEqual({ abilityChecks: false, attacksAndSaves: false });
  });
});
