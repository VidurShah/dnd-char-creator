import { useMemo, useState } from 'react';
import type { ContentEntry } from '@/schema/content';
import type { BuilderInventoryDraft } from '../builderState';
import { resolveItemRef } from '../resolveItemRef';

interface EquipmentStepProps {
  items: ContentEntry[];
  backgroundEntry: ContentEntry | undefined;
  classEntry: ContentEntry | undefined;
  inventory: BuilderInventoryDraft[];
  onChange: (inventory: BuilderInventoryDraft[]) => void;
  equipmentChoicePicks: number[];
  onChoicePick: (choiceIndex: number, optionIndex: number) => void;
  takeStartingGold: boolean;
  onToggleStartingGold: (value: boolean) => void;
  currency: { cp: number; sp: number; ep: number; gp: number; pp: number };
  onCurrencyChange: (currency: { cp: number; sp: number; ep: number; gp: number; pp: number }) => void;
}

function itemNames(items: ContentEntry[], refs: string[]): string {
  return refs.map((r) => resolveItemRef(items, r)?.name ?? r).join(', ');
}

export function EquipmentStep({
  items,
  backgroundEntry,
  classEntry,
  inventory,
  onChange,
  equipmentChoicePicks,
  onChoicePick,
  takeStartingGold,
  onToggleStartingGold,
  currency,
  onCurrencyChange,
}: EquipmentStepProps) {
  const [query, setQuery] = useState('');

  const backgroundGear = backgroundEntry?.kind === 'background' ? backgroundEntry.data.equipment : [];
  const startingEquipment = classEntry?.kind === 'class' ? classEntry.data.startingEquipment : undefined;

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return items.filter((i) => i.name.toLowerCase().includes(q)).slice(0, 8);
  }, [items, query]);

  function addItem(item: ContentEntry) {
    if (inventory.some((i) => i.itemRef === item.id)) return;
    onChange([...inventory, { itemRef: item.id, qty: 1, equipped: item.kind === 'item' && (item.data.category === 'weapon' || item.data.category === 'armor' || item.data.category === 'shield') }]);
  }

  function removeItem(itemRef: string) {
    onChange(inventory.filter((i) => i.itemRef !== itemRef));
  }

  function toggleEquipped(itemRef: string) {
    onChange(inventory.map((i) => (i.itemRef === itemRef ? { ...i, equipped: !i.equipped } : i)));
  }

  const itemById = new Map(items.map((i) => [i.id, i]));

  return (
    <div className="flex flex-col gap-6">
      {backgroundGear.length > 0 && (
        <div>
          <p className="mb-1 font-mono text-xs uppercase tracking-wider text-ink-500 dark:text-kraft-300">
            Granted by background
          </p>
          <p className="text-sm text-ink-700 dark:text-kraft-200">{itemNames(items, backgroundGear)}</p>
        </div>
      )}

      {startingEquipment && (
        <div>
          <p className="mb-1 font-mono text-xs uppercase tracking-wider text-ink-500 dark:text-kraft-300">Starting gear</p>
          <label className="mb-3 flex items-center gap-2 text-sm">
            <input type="checkbox" checked={takeStartingGold} onChange={(e) => onToggleStartingGold(e.target.checked)} />
            Take {startingEquipment.goldAlternative} gp instead of the class equipment package
          </label>

          {!takeStartingGold && (
            <div className="flex flex-col gap-3">
              {startingEquipment.fixed.length > 0 && (
                <p className="text-sm text-ink-700 dark:text-kraft-200">{itemNames(items, startingEquipment.fixed)}</p>
              )}
              {startingEquipment.choices.map((choice, ci) => (
                <div key={ci}>
                  <p className="mb-1 text-xs text-ink-500 dark:text-kraft-300">{choice.prompt}</p>
                  <ul className="flex flex-col gap-1">
                    {choice.options.map((option, oi) => (
                      <li key={oi}>
                        <label className="flex items-center gap-2 text-sm">
                          <input
                            type="radio"
                            name={`equip-choice-${ci}`}
                            checked={(equipmentChoicePicks[ci] ?? 0) === oi}
                            onChange={() => onChoicePick(ci, oi)}
                          />
                          {itemNames(items, option)}
                        </label>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div>
        <p className="mb-1.5 font-mono text-xs uppercase tracking-wider text-ink-500 dark:text-kraft-300">Starting gold</p>
        <div className="flex gap-3 font-mono text-sm">
          {(['pp', 'gp', 'ep', 'sp', 'cp'] as const).map((denom) => (
            <label key={denom} className="flex items-center gap-1">
              <input
                type="number"
                min={0}
                value={currency[denom]}
                onChange={(e) => onCurrencyChange({ ...currency, [denom]: Math.max(0, Number(e.target.value) || 0) })}
                className="w-14 border-b-2 border-dashed border-ink-900/30 bg-transparent px-1 py-1 outline-none focus:border-rust-500 dark:border-kraft-100/30"
              />
              {denom}
            </label>
          ))}
        </div>
      </div>

      <div>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search for extra gear to add…"
          className="mb-3 w-full border-b-2 border-dashed border-ink-900/30 bg-transparent px-1 py-2 text-sm outline-none focus:border-rust-500 dark:border-kraft-100/30"
        />
        {matches.length > 0 && (
          <ul className="mb-6 flex flex-col gap-1">
            {matches.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => addItem(item)}
                  className="flex w-full items-center justify-between px-2 py-1.5 text-left text-sm hover:bg-ink-900/5 dark:hover:bg-kraft-100/5"
                >
                  <span>{item.name}</span>
                  <span className="font-mono text-xs text-rust-500">+ add</span>
                </button>
              </li>
            ))}
          </ul>
        )}

        <p className="mb-2 font-mono text-xs uppercase tracking-wider text-ink-500 dark:text-kraft-300">
          Extra inventory ({inventory.length})
        </p>
        {inventory.length === 0 ? (
          <p className="text-sm text-ink-700 dark:text-kraft-200">Nothing added yet.</p>
        ) : (
          <ul className="divide-y-2 divide-dashed divide-ink-900/15 dark:divide-kraft-100/15">
            {inventory.map((entry) => {
              const item = itemById.get(entry.itemRef);
              if (!item) return null;
              return (
                <li key={entry.itemRef} className="flex items-center justify-between py-2">
                  <span>{item.name}</span>
                  <span className="flex items-center gap-3">
                    <label className="flex items-center gap-1.5 font-mono text-xs uppercase tracking-wide">
                      <input type="checkbox" checked={entry.equipped} onChange={() => toggleEquipped(entry.itemRef)} />
                      Equipped
                    </label>
                    <button type="button" onClick={() => removeItem(entry.itemRef)} className="font-mono text-xs text-rust-500">
                      Remove
                    </button>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
