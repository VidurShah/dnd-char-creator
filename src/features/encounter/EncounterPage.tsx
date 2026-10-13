import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db/dexie';
import type { Character } from '@/schema/character';
import type { Edition } from '@/schema/common';
import type { Combatant, Encounter, MonsterCombatant } from '@/schema/encounter';
import { computeSheet, type DerivedSheet } from '@/engine/compute';
import { rollD20 } from '@/engine/dice';
import { humanizeCamel } from '@/lib/text';
import { CONDITIONS } from '@/features/characters/sheet/conditions';
import {
  adjustHp,
  rollCheck,
  rollDamage,
  setConcentration,
  toggleCondition,
} from '@/features/characters/sheet/sheetActions';
import {
  addCharacters,
  addMonsters,
  concentrationDc,
  damageMonster,
  emptyEncounter,
  healMonster,
  isDown,
  log,
  nextTurn,
  previousTurn,
  removeCombatant,
  setInitiative,
  setMonsterConcentrating,
  sortByInitiative,
  startCombat,
  toggleMonsterCondition,
} from './encounter';
import { useEditionIndexes, useEncounter } from './useEncounter';

const BTN =
  'border-2 border-ink-900/30 px-3 py-1.5 font-mono text-xs uppercase tracking-wide text-ink-700 hover:border-ink-900/60 disabled:opacity-30 dark:border-kraft-100/30 dark:text-kraft-200';
const BTN_PRIMARY =
  'border-2 border-ink-900 bg-ink-900 px-3 py-1.5 font-mono text-xs uppercase tracking-wide text-kraft-50 disabled:opacity-30 dark:border-kraft-100 dark:bg-kraft-100 dark:text-ink-900';
const INPUT =
  'border-b-2 border-dashed border-ink-900/30 bg-transparent px-1 py-1 text-sm outline-none focus:border-rust-500 dark:border-kraft-100/30';

/** A pending concentration check, raised when a concentrating combatant takes damage. */
interface ConcentrationCheck {
  combatantId: string;
  dc: number;
  result?: { total: number; kept: boolean };
}

interface CharacterView {
  character: Character;
  sheet: DerivedSheet;
}

function combatantName(c: Combatant, views: Map<string, CharacterView>): string {
  return c.kind === 'monster' ? c.name : (views.get(c.characterId)?.character.name ?? 'Missing character');
}

/**
 * Initiative order over the party and ad-hoc monsters, built on the same
 * primitives the sheet uses: a character's HP, conditions and concentration
 * change through sheetActions, so the tracker and the sheet are one source of
 * truth, and initiative and concentration rolls land in each character's own
 * roll log.
 */
export function EncounterPage() {
  const { encounter, update } = useEncounter();
  const characters = useLiveQuery(() => db.characters.orderBy('updatedAt').reverse().toArray(), []);
  const [check, setCheck] = useState<ConcentrationCheck | null>(null);

  const inFight = useMemo(
    () => new Set(encounter?.combatants.flatMap((c) => (c.kind === 'character' ? [c.characterId] : [])) ?? []),
    [encounter],
  );
  const party = useMemo(() => (characters ?? []).filter((c) => inFight.has(c.id)), [characters, inFight]);
  const indexes = useEditionIndexes(party.map((c) => c.edition));

  const views = useMemo(() => {
    const map = new Map<string, CharacterView>();
    for (const character of party) {
      const index = indexes[character.edition];
      if (index) map.set(character.id, { character, sheet: computeSheet(character, index) });
    }
    return map;
  }, [party, indexes]);

  /** Monsters have no edition of their own; they follow the table's, taken from the party. */
  const tableEdition: Edition = party[0]?.edition ?? '2014';

  if (!encounter || !characters) return <p className="text-sm text-ink-700 dark:text-kraft-200">Loading…</p>;

  const started = encounter.round > 0;
  /**
   * A character's sheet needs its edition's content loaded. Until it is, their
   * initiative can't be rolled — and silently skipping them would leave the
   * players out of the order with no sign why.
   */
  const sheetsReady = party.every((c) => views.has(c.id));
  const active = encounter.combatants.find((c) => c.id === encounter.activeId);

  async function rollInitiative() {
    const rolled: { id: string; name: string; total: number }[] = [];
    for (const c of encounter!.combatants) {
      if (c.initiative !== null) continue;
      if (c.kind === 'monster') {
        rolled.push({ id: c.id, name: c.name, total: rollD20('normal', c.initiativeBonus).total });
      } else {
        const view = views.get(c.characterId);
        if (!view) continue;
        // Logged to the character's own roll log, same as rolling it on the sheet.
        rolled.push({ id: c.id, name: view.character.name, total: rollCheck(view.character, 'Initiative', view.sheet.initiative).total });
      }
    }
    if (rolled.length === 0) return;
    await update((enc) => {
      let next = enc;
      for (const r of rolled) next = setInitiative(next, r.id, r.total);
      return log(next, `Initiative: ${rolled.map((r) => `${r.name} ${r.total}`).join(', ')}`);
    });
  }

  async function damage(c: Combatant, amount: number) {
    if (amount <= 0) return;
    const name = combatantName(c, views);
    if (c.kind === 'monster') {
      await update((enc) => log(damageMonster(enc, c.id, amount), `${name} takes ${amount} damage`));
      if (c.concentrating) setCheck({ combatantId: c.id, dc: concentrationDc(tableEdition, amount) });
      return;
    }
    const view = views.get(c.characterId);
    if (!view) return;
    await adjustHp(view.character, -amount, view.sheet.hp.max);
    await update((enc) => log(enc, `${name} takes ${amount} damage`));
    // The rule tables forget most: damage while concentrating means a Con save.
    if (view.character.state.concentratingOn) setCheck({ combatantId: c.id, dc: concentrationDc(view.character.edition, amount) });
  }

  async function heal(c: Combatant, amount: number) {
    if (amount <= 0) return;
    const name = combatantName(c, views);
    if (c.kind === 'monster') {
      await update((enc) => log(healMonster(enc, c.id, amount), `${name} heals ${amount}`));
      return;
    }
    const view = views.get(c.characterId);
    if (!view) return;
    await adjustHp(view.character, amount, view.sheet.hp.max);
    await update((enc) => log(enc, `${name} heals ${amount}`));
  }

  async function resolveCheck(kept: boolean, total?: number) {
    if (!check) return;
    const c = encounter!.combatants.find((x) => x.id === check.combatantId);
    if (!c) return setCheck(null);
    const name = combatantName(c, views);
    const how = total === undefined ? '' : ` (rolled ${total} vs DC ${check.dc})`;
    if (!kept) {
      if (c.kind === 'monster') await update((enc) => setMonsterConcentrating(enc, c.id, false));
      else {
        const view = views.get(c.characterId);
        if (view) await setConcentration(view.character, undefined);
      }
    }
    await update((enc) => log(enc, `${name} ${kept ? 'keeps' : 'loses'} concentration${how}`));
    setCheck(total === undefined ? null : { ...check, result: { total, kept } });
  }

  function rollConcentration() {
    if (!check) return;
    const c = encounter!.combatants.find((x) => x.id === check.combatantId);
    if (c?.kind !== 'character') return;
    const view = views.get(c.characterId);
    if (!view) return;
    const result = rollCheck(view.character, `Concentration (DC ${check.dc})`, view.sheet.savingThrows.con.mod);
    void resolveCheck(result.total >= check.dc, result.total);
  }

  const checkTarget = check ? encounter.combatants.find((c) => c.id === check.combatantId) : undefined;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-xl text-ink-900 dark:text-kraft-100">
          Encounter{started && <span className="ml-2 font-mono text-sm text-ink-500 dark:text-kraft-300">· round {encounter.round}</span>}
        </h1>
        <div className="flex flex-wrap items-center gap-2">
          {started ? (
            <>
              <button type="button" className={BTN} onClick={() => update(previousTurn)}>
                ← Prev
              </button>
              <button type="button" className={BTN_PRIMARY} onClick={() => update(nextTurn)}>
                Next turn →
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                className={BTN}
                disabled={!sheetsReady || !encounter.combatants.some((c) => c.initiative === null)}
                onClick={rollInitiative}
              >
                {sheetsReady ? 'Roll initiative' : 'Loading sheets…'}
              </button>
              <button
                type="button"
                className={BTN_PRIMARY}
                disabled={encounter.combatants.length === 0}
                onClick={() => update(startCombat)}
              >
                Start combat
              </button>
            </>
          )}
          <button
            type="button"
            className={BTN}
            disabled={encounter.combatants.length === 0}
            onClick={() => {
              if (window.confirm('End this encounter and clear the tracker? Characters keep their HP and conditions.')) {
                setCheck(null);
                void update(() => emptyEncounter());
              }
            }}
          >
            End
          </button>
        </div>
      </div>

      {!started && (
        <Setup
          characters={characters}
          inFight={inFight}
          onAddCharacters={(ids) => update((enc) => addCharacters(enc, ids))}
          onAddMonsters={(input) => update((enc) => addMonsters(enc, input))}
        />
      )}

      {check && checkTarget && (
        <ConcentrationPrompt
          name={combatantName(checkTarget, views)}
          check={check}
          canRoll={checkTarget.kind === 'character'}
          onRoll={rollConcentration}
          onResolve={(kept) => resolveCheck(kept)}
          onDismiss={() => setCheck(null)}
        />
      )}

      {encounter.combatants.length === 0 ? (
        <div className="border-2 border-dashed border-ink-900/25 px-6 py-12 text-center text-sm text-ink-700 dark:border-kraft-100/25 dark:text-kraft-200">
          Add your party and some monsters, roll initiative, and start combat.
        </div>
      ) : (
        <ol className="divide-y-2 divide-dashed divide-ink-900/15 border-y-2 border-ink-900/15 dark:divide-kraft-100/15 dark:border-kraft-100/15">
          {(started ? encounter.combatants : sortByInitiative(encounter.combatants)).map((c) => (
            <CombatantRow
              key={c.id}
              combatant={c}
              view={c.kind === 'character' ? views.get(c.characterId) : undefined}
              active={c.id === encounter.activeId}
              onInitiative={(value) => update((enc) => setInitiative(enc, c.id, value))}
              onDamage={(n) => damage(c, n)}
              onHeal={(n) => heal(c, n)}
              onToggleCondition={(ref) => {
                if (c.kind === 'monster') return update((enc) => toggleMonsterCondition(enc, c.id, ref));
                const view = views.get(c.characterId);
                return view ? toggleCondition(view.character, ref) : undefined;
              }}
              onConcentration={(on) => {
                if (c.kind === 'monster') return update((enc) => setMonsterConcentrating(enc, c.id, on !== undefined));
                const view = views.get(c.characterId);
                return view ? setConcentration(view.character, on) : undefined;
              }}
              onRemove={() => update((enc) => removeCombatant(enc, c.id))}
            />
          ))}
        </ol>
      )}

      {started && active && <TurnPanel combatant={active} view={active.kind === 'character' ? views.get(active.characterId) : undefined} />}

      <EncounterLog encounter={encounter} />
    </div>
  );
}

function Setup({
  characters,
  inFight,
  onAddCharacters,
  onAddMonsters,
}: {
  characters: Character[];
  inFight: Set<string>;
  onAddCharacters: (ids: string[]) => void;
  onAddMonsters: (input: { name: string; ac: number; hp: number; initiativeBonus: number; count: number }) => void;
}) {
  const [monster, setMonster] = useState({ name: '', ac: '12', hp: '10', init: '0', count: '1' });
  const available = characters.filter((c) => !inFight.has(c.id));

  return (
    <div className="mb-5 grid gap-4 md:grid-cols-2">
      <div className="border-2 border-ink-900/15 p-3 dark:border-kraft-100/15">
        <p className="mb-2 font-mono text-xs uppercase tracking-wider text-ink-500 dark:text-kraft-300">Party</p>
        {characters.length === 0 ? (
          <p className="text-sm text-ink-700 dark:text-kraft-200">
            No characters yet. <Link to="/characters/new" className="underline">Make one</Link>.
          </p>
        ) : available.length === 0 ? (
          <p className="text-sm text-ink-700 dark:text-kraft-200">Everyone's in.</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {available.map((c) => (
              <button key={c.id} type="button" className={BTN} onClick={() => onAddCharacters([c.id])}>
                + {c.name}
              </button>
            ))}
            {available.length > 1 && (
              <button type="button" className={BTN_PRIMARY} onClick={() => onAddCharacters(available.map((c) => c.id))}>
                + All
              </button>
            )}
          </div>
        )}
      </div>

      <form
        className="border-2 border-ink-900/15 p-3 dark:border-kraft-100/15"
        onSubmit={(e) => {
          e.preventDefault();
          if (!monster.name.trim()) return;
          onAddMonsters({
            name: monster.name,
            ac: Number(monster.ac) || 0,
            hp: Number(monster.hp) || 1,
            initiativeBonus: Number(monster.init) || 0,
            count: Number(monster.count) || 1,
          });
          setMonster((m) => ({ ...m, name: '' }));
        }}
      >
        <p className="mb-2 font-mono text-xs uppercase tracking-wider text-ink-500 dark:text-kraft-300">Monsters</p>
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex min-w-[8rem] flex-1 flex-col text-[11px] text-ink-500 dark:text-kraft-300">
            Name
            <input className={INPUT} value={monster.name} placeholder="Goblin" onChange={(e) => setMonster({ ...monster, name: e.target.value })} />
          </label>
          {(
            [
              ['ac', 'AC'],
              ['hp', 'HP'],
              ['init', 'Init ±'],
              ['count', '×'],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="flex w-12 flex-col text-[11px] text-ink-500 dark:text-kraft-300">
              {label}
              <input
                className={INPUT}
                inputMode="numeric"
                value={monster[key]}
                onChange={(e) => setMonster({ ...monster, [key]: e.target.value.replace(/[^\d-]/g, '') })}
              />
            </label>
          ))}
          <button type="submit" className={BTN_PRIMARY} disabled={!monster.name.trim()}>
            Add
          </button>
        </div>
      </form>
    </div>
  );
}

function HpBar({ current, max }: { current: number; max: number }) {
  const pct = max > 0 ? Math.round((current / max) * 100) : 0;
  return (
    <span className="inline-block h-2 w-16 border border-ink-900/40 align-middle dark:border-kraft-100/40" aria-hidden>
      <span className={`block h-full ${pct > 50 ? 'bg-ink-700' : pct > 0 ? 'bg-rust-500' : ''} dark:bg-kraft-200`} style={{ width: `${pct}%` }} />
    </span>
  );
}

function CombatantRow({
  combatant: c,
  view,
  active,
  onInitiative,
  onDamage,
  onHeal,
  onToggleCondition,
  onConcentration,
  onRemove,
}: {
  combatant: Combatant;
  view?: CharacterView;
  active: boolean;
  onInitiative: (value: number | null) => void;
  onDamage: (n: number) => void;
  onHeal: (n: number) => void;
  onToggleCondition: (ref: string) => void;
  onConcentration: (on: string | undefined) => void;
  onRemove: () => void;
}) {
  const [amount, setAmount] = useState('');
  const [expanded, setExpanded] = useState(false);
  const [initDraft, setInitDraft] = useState<string | null>(null);

  const monster: MonsterCombatant | undefined = c.kind === 'monster' ? c : undefined;
  const character = view?.character;
  const name = monster?.name ?? character?.name ?? 'Missing character';
  const hp = monster
    ? { current: monster.hp.current, max: monster.hp.max, temp: monster.hp.temp }
    : character && view
      ? { current: character.state.hp.current, max: view.sheet.hp.max, temp: character.state.hp.tempHp }
      : null;
  const ac = monster?.ac ?? view?.sheet.ac.value;
  const conditions = monster?.conditions ?? character?.state.conditions.map((x) => x.ref) ?? [];
  const concentratingOn = monster ? (monster.concentrating ? 'concentrating' : undefined) : character?.state.concentratingOn;
  const down = isDown(c) || (character && character.state.hp.current === 0);

  const n = Number(amount);
  const apply = (fn: (n: number) => void) => {
    if (n > 0) fn(Math.floor(n));
    setAmount('');
  };

  return (
    <li className={`px-2 py-2 ${active ? 'bg-rust-500/10' : ''} ${down ? 'opacity-60' : ''}`} aria-current={active ? 'step' : undefined}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <span className="w-3 font-mono text-sm text-rust-600 dark:text-rust-500" aria-hidden>
          {active ? '▶' : ''}
        </span>
        <input
          aria-label={`${name} initiative`}
          inputMode="numeric"
          className={`${INPUT} w-10 text-center font-mono`}
          value={initDraft ?? (c.initiative ?? '')}
          placeholder="—"
          onChange={(e) => setInitDraft(e.target.value.replace(/[^\d-]/g, ''))}
          onBlur={() => {
            if (initDraft !== null) onInitiative(initDraft === '' ? null : Number(initDraft));
            setInitDraft(null);
          }}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        />
        <span className="min-w-[7rem] flex-1 font-medium text-ink-900 dark:text-kraft-100">
          {character ? (
            <Link to={`/characters/${character.id}`} className="hover:underline">
              {name}
            </Link>
          ) : (
            name
          )}
          {down && <span className="ml-2 font-mono text-[11px] uppercase text-rust-600 dark:text-rust-500">✕ down</span>}
        </span>
        {hp && (
          <span className="flex items-center gap-1.5 font-mono text-xs text-ink-700 dark:text-kraft-200">
            {monster && <HpBar current={hp.current} max={hp.max} />}
            {hp.current}/{hp.max}
            {hp.temp > 0 && <span className="text-ink-500">+{hp.temp}</span>}
          </span>
        )}
        {ac !== undefined && <span className="font-mono text-xs text-ink-500 dark:text-kraft-300">AC {ac}</span>}
        <span className="flex items-center gap-1">
          <input
            aria-label={`Damage or healing for ${name}`}
            inputMode="numeric"
            className={`${INPUT} w-12 text-center font-mono`}
            value={amount}
            placeholder="±"
            onChange={(e) => setAmount(e.target.value.replace(/\D/g, ''))}
            onKeyDown={(e) => e.key === 'Enter' && apply(onDamage)}
          />
          <button type="button" className="border border-rust-500/60 px-1.5 py-0.5 font-mono text-[11px] uppercase text-rust-600 dark:text-rust-500" onClick={() => apply(onDamage)}>
            Dmg
          </button>
          <button type="button" className="border border-ink-900/30 px-1.5 py-0.5 font-mono text-[11px] uppercase text-ink-700 dark:border-kraft-100/30 dark:text-kraft-200" onClick={() => apply(onHeal)}>
            Heal
          </button>
        </span>
        <button type="button" onClick={() => setExpanded((v) => !v)} aria-expanded={expanded} className="font-mono text-[11px] uppercase text-ink-500 hover:text-rust-500 dark:text-kraft-300">
          Status {expanded ? '▴' : '▾'}
        </button>
        <button type="button" onClick={onRemove} aria-label={`Remove ${name}`} className="font-mono text-sm text-ink-500 hover:text-rust-500 dark:text-kraft-300">
          ✕
        </button>
      </div>

      {(conditions.length > 0 || concentratingOn) && (
        <div className="mt-1 flex flex-wrap gap-1 pl-[4.25rem]">
          {concentratingOn && (
            <span className="rounded-sm bg-ink-900 px-1.5 py-0.5 font-mono text-[10px] uppercase text-kraft-50 dark:bg-kraft-100 dark:text-ink-900">
              ● {concentratingOn === 'concentrating' ? 'concentrating' : `concentrating · ${concentratingOn}`}
            </span>
          )}
          {conditions.map((ref) => (
            <span key={ref} className="rounded-sm border border-ink-900/40 px-1.5 py-0.5 font-mono text-[10px] uppercase text-ink-700 dark:border-kraft-100/40 dark:text-kraft-200">
              {humanizeCamel(ref)}
            </span>
          ))}
        </div>
      )}

      {expanded && (
        <div className="mt-2 flex flex-wrap gap-1.5 pl-[4.25rem]">
          <ConcentrationToggle isMonster={!!monster} on={concentratingOn} onChange={onConcentration} />
          {CONDITIONS.map((ref) => (
            <button
              key={ref}
              type="button"
              onClick={() => onToggleCondition(ref)}
              className={`rounded-sm border px-2 py-0.5 font-mono text-[11px] uppercase tracking-wide ${
                conditions.includes(ref)
                  ? 'border-ink-900 bg-ink-900 text-kraft-50 dark:border-kraft-100 dark:bg-kraft-100 dark:text-ink-900'
                  : 'border-ink-900/25 text-ink-700 hover:border-ink-900/50 dark:border-kraft-100/25 dark:text-kraft-200'
              }`}
            >
              {humanizeCamel(ref)}
            </button>
          ))}
        </div>
      )}
    </li>
  );
}

/** Characters name what they're concentrating on; for a monster a flag is enough. */
function ConcentrationToggle({ isMonster, on, onChange }: { isMonster: boolean; on?: string; onChange: (on: string | undefined) => void }) {
  const [draft, setDraft] = useState('');
  if (on) {
    return (
      <button type="button" onClick={() => onChange(undefined)} className="rounded-sm border border-rust-500 px-2 py-0.5 font-mono text-[11px] uppercase text-rust-600 dark:text-rust-500">
        End concentration
      </button>
    );
  }
  if (isMonster) {
    return (
      <button type="button" onClick={() => onChange('concentrating')} className="rounded-sm border border-ink-900/25 px-2 py-0.5 font-mono text-[11px] uppercase text-ink-700 dark:border-kraft-100/25 dark:text-kraft-200">
        Concentrating
      </button>
    );
  }
  return (
    <form
      className="flex items-center gap-1"
      onSubmit={(e) => {
        e.preventDefault();
        onChange(draft.trim() || 'a spell');
        setDraft('');
      }}
    >
      <input className={`${INPUT} w-28 text-xs`} value={draft} placeholder="Concentrating on…" onChange={(e) => setDraft(e.target.value)} />
      <button type="submit" className="rounded-sm border border-ink-900/25 px-2 py-0.5 font-mono text-[11px] uppercase text-ink-700 dark:border-kraft-100/25 dark:text-kraft-200">
        Start
      </button>
    </form>
  );
}

function ConcentrationPrompt({
  name,
  check,
  canRoll,
  onRoll,
  onResolve,
  onDismiss,
}: {
  name: string;
  check: ConcentrationCheck;
  canRoll: boolean;
  onRoll: () => void;
  onResolve: (kept: boolean) => void;
  onDismiss: () => void;
}) {
  return (
    <div role="alert" className="mb-4 flex flex-wrap items-center gap-2 border-2 border-rust-500 bg-rust-500/10 px-3 py-2 text-sm text-ink-900 dark:text-kraft-100">
      {check.result ? (
        <>
          <span>
            {name} rolled <b>{check.result.total}</b> vs DC {check.dc} — {check.result.kept ? 'concentration holds.' : 'concentration is broken.'}
          </span>
          <button type="button" className={BTN} onClick={onDismiss}>
            OK
          </button>
        </>
      ) : (
        <>
          <span>
            <b>{name}</b> took damage while concentrating — <b>Constitution save, DC {check.dc}</b>.
          </span>
          {canRoll && (
            <button type="button" className={BTN_PRIMARY} onClick={onRoll}>
              Roll save
            </button>
          )}
          <button type="button" className={BTN} onClick={() => onResolve(true)}>
            Made it
          </button>
          <button type="button" className={BTN} onClick={() => onResolve(false)}>
            Lost it
          </button>
        </>
      )}
    </div>
  );
}

/** The current combatant's turn: what a player needs without opening their sheet. */
function TurnPanel({ combatant, view }: { combatant: Combatant; view?: CharacterView }) {
  const [last, setLast] = useState<string | null>(null);
  const name = combatant.kind === 'monster' ? combatant.name : (view?.character.name ?? 'Missing character');

  return (
    <section className="mt-5 border-2 border-ink-900 p-3 dark:border-kraft-100" aria-label={`${name}'s turn`}>
      <p className="mb-2 font-mono text-xs uppercase tracking-wider text-ink-500 dark:text-kraft-300">── {name}'s turn ──</p>
      {combatant.kind === 'monster' ? (
        <p className="text-sm text-ink-700 dark:text-kraft-200">
          AC {combatant.ac} · HP {combatant.hp.current}/{combatant.hp.max}
          {combatant.initiativeBonus !== 0 && ` · Init ${combatant.initiativeBonus > 0 ? '+' : ''}${combatant.initiativeBonus}`}
        </p>
      ) : view ? (
        <div className="flex flex-col gap-2 text-sm">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="mr-1 font-mono text-xs uppercase text-ink-500 dark:text-kraft-300">Attacks</span>
            {view.sheet.attacks.length === 0 && <span className="text-ink-500">none</span>}
            {view.sheet.attacks.map((atk) => (
              <span key={atk.itemRef} className="inline-flex">
                <button
                  type="button"
                  className="border-2 border-ink-900/30 px-2 py-1 font-mono text-xs dark:border-kraft-100/30"
                  onClick={() => {
                    const r = rollCheck(view.character, `${atk.name} attack`, atk.attackBonus);
                    setLast(`${atk.name}: ${r.total} to hit${r.rolls[0] === 20 ? ' — critical!' : r.rolls[0] === 1 ? ' — natural 1' : ''}`);
                  }}
                >
                  {atk.name} {atk.attackBonus >= 0 ? '+' : ''}
                  {atk.attackBonus}
                </button>
                <button
                  type="button"
                  className="border-2 border-l-0 border-ink-900/30 px-2 py-1 font-mono text-xs dark:border-kraft-100/30"
                  title="Roll damage"
                  onClick={() => {
                    const r = rollDamage(view.character, `${atk.name} damage`, atk.damageDice, atk.damageBonus);
                    setLast(`${atk.name}: ${r.total} ${atk.damageType} damage`);
                  }}
                >
                  {atk.damageDice}
                  {atk.damageBonus ? `${atk.damageBonus > 0 ? '+' : ''}${atk.damageBonus}` : ''}
                </button>
              </span>
            ))}
          </div>
          {last && <p className="font-mono text-sm text-rust-600 dark:text-rust-500">{last}</p>}
          <p className="text-ink-700 dark:text-kraft-200">
            Move {view.sheet.speed} ft · AC {view.sheet.ac.value}
            {view.sheet.spellcasting && ` · Spell save DC ${view.sheet.spellcasting.saveDc}`} ·{' '}
            <Link to={`/characters/${view.character.id}`} className="underline">
              Open sheet
            </Link>
          </p>
        </div>
      ) : null}
    </section>
  );
}

function EncounterLog({ encounter }: { encounter: Encounter }) {
  if (encounter.log.length === 0) return null;
  return (
    <section className="mt-5">
      <p className="mb-1.5 font-mono text-xs uppercase tracking-wider text-ink-500 dark:text-kraft-300">Log</p>
      <ul className="max-h-56 overflow-y-auto text-sm text-ink-700 dark:text-kraft-200">
        {encounter.log.map((entry) => (
          <li key={entry.id} className="border-b border-dashed border-ink-900/10 py-0.5 dark:border-kraft-100/10">
            {entry.round > 0 && <span className="mr-2 font-mono text-[11px] text-ink-500 dark:text-kraft-300">R{entry.round}</span>}
            {entry.text}
          </li>
        ))}
      </ul>
    </section>
  );
}
