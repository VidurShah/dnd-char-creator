import { useMemo, useState } from 'react';
import { useParams } from 'react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db/dexie';
import { useContentIndex } from '@/content/useContentIndex';
import { computeSheet } from '@/engine/compute';
import { adjustHp, setTempHp } from './sheetActions';
import { LevelUpPanel } from './LevelUpPanel';
import { exportCharacter } from '@/db/exportImport';
import { downloadJson } from '@/lib/download';
import { StatsPanel } from './StatsPanel';
import { ActionsPanel } from './ActionsPanel';
import { LorePanel } from './LorePanel';
import { InventoryPanel } from './InventoryPanel';
import { RollLogPanel } from './RollLogPanel';
import { FeaturesPanel } from './FeaturesPanel';

const TABS = ['Stats', 'Actions', 'Inventory', 'Features', 'Lore', 'Rolls'] as const;
type Tab = (typeof TABS)[number];

export function CharacterSheetPage() {
  const { id } = useParams();
  const character = useLiveQuery(() => (id ? db.characters.get(id) : undefined), [id]);
  const { byId, entries, loading } = useContentIndex(character?.edition ?? '2014');
  const [tab, setTab] = useState<Tab>('Stats');
  const [hpInput, setHpInput] = useState('');
  const [showLevelUp, setShowLevelUp] = useState(false);

  const sheet = useMemo(() => (character ? computeSheet(character, byId) : null), [character, byId]);
  const items = useMemo(() => entries.filter((e) => e.kind === 'item'), [entries]);
  const classEntries = useMemo(() => entries.filter((e) => e.kind === 'class'), [entries]);
  const subclassEntries = useMemo(() => entries.filter((e) => e.kind === 'subclass'), [entries]);
  const featEntries = useMemo(() => entries.filter((e) => e.kind === 'feat'), [entries]);

  if (character === undefined || loading) return <p className="text-sm text-ink-700 dark:text-kraft-200">Loading…</p>;
  if (character === null || !sheet) return <p className="text-sm text-ink-700 dark:text-kraft-200">Character not found.</p>;

  function applyHpDelta(sign: 1 | -1) {
    const amount = Number(hpInput);
    if (!Number.isFinite(amount) || amount === 0 || !character || !sheet) return;
    adjustHp(character, sign * amount, sheet.hp.max);
    setHpInput('');
  }

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-xl text-ink-900 dark:text-kraft-100">{character.name}</h1>
          <div className="mt-2 flex flex-wrap gap-2">
            {[
              { label: 'Level', value: sheet.totalLevel },
              { label: 'AC', value: sheet.ac.value },
              { label: 'Speed', value: `${sheet.speed} ft` },
              { label: 'Initiative', value: `${sheet.initiative >= 0 ? '+' : ''}${sheet.initiative}` },
              { label: 'Passive Perception', value: sheet.passivePerception },
            ].map(({ label, value }) => (
              <div key={label} className="border-2 border-ink-900/20 px-3 py-1.5 text-center dark:border-kraft-100/20">
                <div className="font-mono text-[10px] uppercase tracking-wider text-ink-500 dark:text-kraft-300">{label}</div>
                <div className="font-display text-xl leading-tight">{value}</div>
              </div>
            ))}
          </div>
          {(sheet.senses.length > 0 || sheet.resistances.length > 0) && (
            <p className="mt-2 font-mono text-xs uppercase tracking-wide text-ink-700 dark:text-kraft-200">
              {sheet.senses.length > 0 && sheet.senses.map((s) => `${s.sense} ${s.range} ft`).join(', ')}
              {sheet.senses.length > 0 && sheet.resistances.length > 0 && ' · '}
              {sheet.resistances.length > 0 && `Resist ${sheet.resistances.join(', ')}`}
            </p>
          )}
          <div className="relative mt-2 flex gap-2">
            <button
              type="button"
              onClick={() => setShowLevelUp((v) => !v)}
              className="border border-ink-900/30 px-2 py-1 font-mono text-[11px] uppercase tracking-wide hover:border-rust-500 dark:border-kraft-100/30"
            >
              Level Up
            </button>
            <button
              type="button"
              onClick={() => exportCharacter(character.id).then((file) => downloadJson(`${character.name}.json`, file))}
              className="font-mono text-[11px] uppercase tracking-wide text-ink-700 underline dark:text-kraft-200"
            >
              Export
            </button>
            {showLevelUp && (
              <LevelUpPanel
                character={character}
                index={byId}
                classes={classEntries}
                subclasses={subclassEntries}
                feats={featEntries}
                onClose={() => setShowLevelUp(false)}
              />
            )}
          </div>
        </div>

        <div className="flex items-center gap-3 border-2 border-ink-900/20 px-3 py-2 dark:border-kraft-100/20">
          <div className="text-center">
            <div className="font-mono text-[10px] uppercase tracking-wider text-ink-500 dark:text-kraft-300">HP</div>
            <div className="font-display text-2xl">
              {character.state.hp.current} <span className="text-sm text-ink-700 dark:text-kraft-200">/ {sheet.hp.max}</span>
            </div>
            {character.state.hp.tempHp > 0 && (
              <div className="font-mono text-[10px] text-olive-500">+{character.state.hp.tempHp} temp</div>
            )}
          </div>
          <input
            type="number"
            value={hpInput}
            onChange={(e) => setHpInput(e.target.value)}
            placeholder="0"
            className="w-14 border-b-2 border-dashed border-ink-900/30 bg-transparent px-1 py-1 text-center font-mono text-sm outline-none focus:border-rust-500 dark:border-kraft-100/30"
          />
          <div className="flex flex-col gap-1">
            <button type="button" onClick={() => applyHpDelta(1)} className="border border-ink-900/30 px-2 font-mono text-xs dark:border-kraft-100/30">
              Heal
            </button>
            <button type="button" onClick={() => applyHpDelta(-1)} className="border border-ink-900/30 px-2 font-mono text-xs dark:border-kraft-100/30">
              Damage
            </button>
          </div>
          <button
            type="button"
            onClick={() => setTempHp(character, Number(hpInput) || 0)}
            className="font-mono text-[10px] uppercase tracking-wide text-ink-700 underline dark:text-kraft-200"
          >
            Set temp
          </button>
        </div>
      </div>

      <div className="mb-5 flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`border-2 px-2.5 py-1 font-mono text-[11px] uppercase tracking-wide ${
              tab === t
                ? 'border-ink-900 bg-ink-900 text-kraft-50 dark:border-kraft-100 dark:bg-kraft-100 dark:text-ink-900'
                : 'border-ink-900/25 text-ink-700 dark:border-kraft-100/25 dark:text-kraft-200'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      <hr className="rule-sketch mb-5" />

      {tab === 'Stats' && <StatsPanel character={character} sheet={sheet} />}
      {tab === 'Actions' && <ActionsPanel character={character} sheet={sheet} index={byId} />}
      {tab === 'Inventory' && <InventoryPanel character={character} items={items} sheet={sheet} />}
      {tab === 'Features' && <FeaturesPanel features={sheet.features} />}
      {tab === 'Lore' && <LorePanel character={character} sheet={sheet} />}
      {tab === 'Rolls' && <RollLogPanel character={character} />}
    </div>
  );
}
