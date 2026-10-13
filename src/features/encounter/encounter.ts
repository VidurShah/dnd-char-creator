import type { Edition } from '@/schema/common';
import type { Combatant, Encounter, MonsterCombatant } from '@/schema/encounter';
import { concentrationDc2014 } from '@/engine/editions/2014';
import { concentrationDc2024 } from '@/engine/editions/2024';

/**
 * Pure state transitions for the encounter tracker. Every function returns a
 * new Encounter; persistence and anything touching a character record live in
 * the page, so the turn logic here is testable on its own.
 */

const LOG_LIMIT = 100;

export function emptyEncounter(): Encounter {
  return { round: 0, activeId: null, combatants: [], log: [] };
}

export function log(enc: Encounter, text: string): Encounter {
  return { ...enc, log: [{ id: crypto.randomUUID(), round: enc.round, text }, ...enc.log].slice(0, LOG_LIMIT) };
}

/**
 * Initiative order: highest first, unrolled combatants last. Ties keep the
 * order they were added in — a DM breaking a tie by hand just edits a number,
 * which is simpler than modeling every table's tie-break house rule.
 */
export function sortByInitiative(combatants: Combatant[]): Combatant[] {
  return combatants
    .map((c, i) => ({ c, i }))
    .sort((a, b) => {
      const ai = a.c.initiative;
      const bi = b.c.initiative;
      if (ai === null && bi === null) return a.i - b.i;
      if (ai === null) return 1;
      if (bi === null) return -1;
      return bi - ai || a.i - b.i;
    })
    .map(({ c }) => c);
}

export function addCharacters(enc: Encounter, characterIds: string[]): Encounter {
  const present = new Set(enc.combatants.flatMap((c) => (c.kind === 'character' ? [c.characterId] : [])));
  const added: Combatant[] = characterIds
    .filter((id) => !present.has(id))
    .map((characterId) => ({ kind: 'character', id: crypto.randomUUID(), characterId, initiative: null }));
  return { ...enc, combatants: [...enc.combatants, ...added] };
}

export interface MonsterInput {
  name: string;
  ac: number;
  hp: number;
  initiativeBonus: number;
  count: number;
}

/** Letter suffixes for a group ("Goblin A", "Goblin B"), continuing past any already in the fight. */
function suffix(n: number): string {
  let s = '';
  for (let i = n; i >= 0; i = Math.floor(i / 26) - 1) s = String.fromCharCode(65 + (i % 26)) + s;
  return s;
}

export function addMonsters(enc: Encounter, input: MonsterInput): Encounter {
  const name = input.name.trim() || 'Monster';
  const count = Math.max(1, Math.min(20, Math.floor(input.count)));
  const existing = enc.combatants.filter(
    (c): c is MonsterCombatant => c.kind === 'monster' && (c.name === name || c.name.startsWith(`${name} `)),
  ).length;
  const lettered = count > 1 || existing > 0;
  const hp = Math.max(1, Math.floor(input.hp));
  const added: MonsterCombatant[] = Array.from({ length: count }, (_, i) => ({
    kind: 'monster',
    id: crypto.randomUUID(),
    name: lettered ? `${name} ${suffix(existing + i)}` : name,
    ac: Math.max(0, Math.floor(input.ac)),
    hp: { current: hp, max: hp, temp: 0 },
    initiativeBonus: Math.floor(input.initiativeBonus),
    initiative: null,
    conditions: [],
    concentrating: false,
  }));
  return { ...enc, combatants: [...enc.combatants, ...added] };
}

/** Sets (or clears) one initiative. Once combat has started the order re-sorts, but whose turn it is does not change. */
export function setInitiative(enc: Encounter, id: string, value: number | null): Encounter {
  const combatants = enc.combatants.map((c) => (c.id === id ? { ...c, initiative: value } : c));
  return { ...enc, combatants: enc.round > 0 ? sortByInitiative(combatants) : combatants };
}

/** Sorts into initiative order and hands the first turn to the top of it. */
export function startCombat(enc: Encounter): Encounter {
  const combatants = sortByInitiative(enc.combatants);
  const first = combatants.find(canAct) ?? combatants[0];
  return log({ ...enc, combatants, round: 1, activeId: first?.id ?? null }, 'Combat begins — round 1');
}

export function isDown(c: Combatant): boolean {
  return c.kind === 'monster' && c.hp.current === 0;
}

/**
 * Monsters at 0 HP are skipped: they're dead or out, and stepping through
 * them every round is busywork. Characters at 0 HP keep their turns, because
 * a downed character still rolls death saves.
 */
function canAct(c: Combatant): boolean {
  return !isDown(c);
}

function step(enc: Encounter, direction: 1 | -1): Encounter {
  const order = enc.combatants;
  if (order.length === 0 || enc.round === 0) return enc;
  const start = Math.max(0, order.findIndex((c) => c.id === enc.activeId));
  let round = enc.round;
  let i = start;
  for (let n = 0; n < order.length; n++) {
    i += direction;
    if (i >= order.length) {
      i = 0;
      round += 1;
    } else if (i < 0) {
      if (round === 1) return enc; // nothing before the first turn of the fight
      i = order.length - 1;
      round -= 1;
    }
    if (canAct(order[i])) break;
  }
  const next = { ...enc, round, activeId: order[i].id };
  return round > enc.round ? log(next, `Round ${round}`) : next;
}

export function nextTurn(enc: Encounter): Encounter {
  return step(enc, 1);
}

export function previousTurn(enc: Encounter): Encounter {
  return step(enc, -1);
}

export function removeCombatant(enc: Encounter, id: string): Encounter {
  // Removing whoever is up passes the turn on first, so the fight doesn't
  // stall on an id that no longer exists.
  const moved = enc.activeId === id && enc.combatants.length > 1 ? nextTurn(enc) : enc;
  const combatants = moved.combatants.filter((c) => c.id !== id);
  return { ...moved, combatants, activeId: moved.activeId === id ? null : moved.activeId };
}

function updateMonster(enc: Encounter, id: string, fn: (m: MonsterCombatant) => MonsterCombatant): Encounter {
  return { ...enc, combatants: enc.combatants.map((c) => (c.id === id && c.kind === 'monster' ? fn(c) : c)) };
}

/** Damage to a monster: temp HP absorbs first, current HP floors at 0. Mirrors adjustHp in sheetActions. */
export function damageMonster(enc: Encounter, id: string, amount: number): Encounter {
  return updateMonster(enc, id, (m) => {
    const absorbed = Math.min(m.hp.temp, amount);
    return { ...m, hp: { ...m.hp, temp: m.hp.temp - absorbed, current: Math.max(0, m.hp.current - (amount - absorbed)) } };
  });
}

export function healMonster(enc: Encounter, id: string, amount: number): Encounter {
  return updateMonster(enc, id, (m) => ({ ...m, hp: { ...m.hp, current: Math.min(m.hp.max, m.hp.current + amount) } }));
}

export function toggleMonsterCondition(enc: Encounter, id: string, condition: string): Encounter {
  return updateMonster(enc, id, (m) => ({
    ...m,
    conditions: m.conditions.includes(condition) ? m.conditions.filter((c) => c !== condition) : [...m.conditions, condition],
  }));
}

export function setMonsterConcentrating(enc: Encounter, id: string, concentrating: boolean): Encounter {
  return updateMonster(enc, id, (m) => ({ ...m, concentrating }));
}

/** The Constitution save DC to keep concentrating after taking `damage`, per the edition's rule. */
export function concentrationDc(edition: Edition, damage: number): number {
  return edition === '2024' ? concentrationDc2024(damage) : concentrationDc2014(damage);
}
