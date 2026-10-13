import { describe, expect, it } from 'vitest';
import type { Encounter, MonsterCombatant } from '@/schema/encounter';
import {
  addCharacters,
  addMonsters,
  concentrationDc,
  damageMonster,
  emptyEncounter,
  healMonster,
  nextTurn,
  previousTurn,
  removeCombatant,
  setInitiative,
  startCombat,
  toggleMonsterCondition,
} from './encounter';

const goblin = { name: 'Goblin', ac: 15, hp: 7, initiativeBonus: 2, count: 1 };

/** Party of two plus two goblins, with fixed initiatives: Lyra 21, Goblin A 18, Thorgar 15, Goblin B 9. */
function fight(): Encounter {
  let enc = addCharacters(emptyEncounter(), ['lyra', 'thorgar']);
  enc = addMonsters(enc, { ...goblin, count: 2 });
  const [lyra, thorgar, a, b] = enc.combatants;
  enc = setInitiative(enc, lyra.id, 21);
  enc = setInitiative(enc, thorgar.id, 15);
  enc = setInitiative(enc, a.id, 18);
  enc = setInitiative(enc, b.id, 9);
  return startCombat(enc);
}

const nameOf = (enc: Encounter, id: string | null) => {
  const c = enc.combatants.find((x) => x.id === id);
  return c?.kind === 'monster' ? c.name : c?.characterId;
};
const order = (enc: Encounter) => enc.combatants.map((c) => nameOf(enc, c.id));

describe('setup', () => {
  it('letters a group of monsters, continuing past ones already in the fight', () => {
    let enc = addMonsters(emptyEncounter(), { ...goblin, count: 2 });
    enc = addMonsters(enc, goblin);
    expect(enc.combatants.map((c) => (c as MonsterCombatant).name)).toEqual(['Goblin A', 'Goblin B', 'Goblin C']);
  });

  it('does not add the same character twice', () => {
    const enc = addCharacters(addCharacters(emptyEncounter(), ['lyra']), ['lyra', 'thorgar']);
    expect(enc.combatants.map((c) => (c.kind === 'character' ? c.characterId : ''))).toEqual(['lyra', 'thorgar']);
  });
});

describe('turn order', () => {
  it('sorts by initiative and starts with the highest', () => {
    const enc = fight();
    expect(order(enc)).toEqual(['lyra', 'Goblin A', 'thorgar', 'Goblin B']);
    expect(nameOf(enc, enc.activeId)).toBe('lyra');
    expect(enc.round).toBe(1);
  });

  it('wraps to a new round after the last combatant', () => {
    let enc = fight();
    for (let i = 0; i < 4; i++) enc = nextTurn(enc);
    expect(nameOf(enc, enc.activeId)).toBe('lyra');
    expect(enc.round).toBe(2);
    expect(enc.log[0].text).toBe('Round 2');
  });

  it('skips monsters at 0 HP but not downed characters', () => {
    let enc = fight();
    const goblinA = enc.combatants[1];
    enc = damageMonster(enc, goblinA.id, 99);
    enc = nextTurn(enc);
    expect(nameOf(enc, enc.activeId)).toBe('thorgar');
  });

  it('steps back, including across a round boundary, but not before round 1', () => {
    let enc = fight();
    expect(previousTurn(enc)).toBe(enc);
    for (let i = 0; i < 4; i++) enc = nextTurn(enc);
    enc = previousTurn(enc);
    expect(nameOf(enc, enc.activeId)).toBe('Goblin B');
    expect(enc.round).toBe(1);
  });

  it('keeps the turn with the same combatant when a late initiative re-sorts the order', () => {
    let enc = nextTurn(fight()); // Goblin A's turn
    enc = addMonsters(enc, { name: 'Hobgoblin', ac: 18, hp: 11, initiativeBonus: 1, count: 1 });
    const hob = enc.combatants[enc.combatants.length - 1];
    enc = setInitiative(enc, hob.id, 25);
    expect(order(enc)[0]).toBe('Hobgoblin');
    expect(nameOf(enc, enc.activeId)).toBe('Goblin A');
  });

  it('passes the turn on when the active combatant is removed', () => {
    let enc = nextTurn(fight()); // Goblin A
    enc = removeCombatant(enc, enc.activeId!);
    expect(nameOf(enc, enc.activeId)).toBe('thorgar');
    expect(order(enc)).toEqual(['lyra', 'thorgar', 'Goblin B']);
  });
});

describe('monster HP and conditions', () => {
  it('burns temp HP first, floors at 0, and heals up to max', () => {
    let enc = addMonsters(emptyEncounter(), goblin);
    const id = enc.combatants[0].id;
    enc = { ...enc, combatants: enc.combatants.map((c) => (c.kind === 'monster' ? { ...c, hp: { ...c.hp, temp: 3 } } : c)) };
    enc = damageMonster(enc, id, 5);
    expect((enc.combatants[0] as MonsterCombatant).hp).toEqual({ current: 5, max: 7, temp: 0 });
    enc = damageMonster(enc, id, 50);
    expect((enc.combatants[0] as MonsterCombatant).hp.current).toBe(0);
    enc = healMonster(enc, id, 50);
    expect((enc.combatants[0] as MonsterCombatant).hp.current).toBe(7);
  });

  it('toggles conditions', () => {
    let enc = addMonsters(emptyEncounter(), goblin);
    const id = enc.combatants[0].id;
    enc = toggleMonsterCondition(enc, id, 'prone');
    expect((enc.combatants[0] as MonsterCombatant).conditions).toEqual(['prone']);
    enc = toggleMonsterCondition(enc, id, 'prone');
    expect((enc.combatants[0] as MonsterCombatant).conditions).toEqual([]);
  });
});

describe('concentrationDc', () => {
  it('is 10 or half the damage, and only 2024 caps it at 30', () => {
    expect(concentrationDc('2014', 7)).toBe(10);
    expect(concentrationDc('2014', 31)).toBe(15);
    expect(concentrationDc('2014', 80)).toBe(40);
    expect(concentrationDc('2024', 80)).toBe(30);
  });
});
