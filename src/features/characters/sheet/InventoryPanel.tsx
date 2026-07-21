import { useMemo, useState } from 'react';
import type { Character } from '@/schema/character';
import type { ContentEntry } from '@/schema/content';
import type { DerivedSheet } from '@/engine/compute';
import { humanizeCamel } from '@/lib/text';
import { addInventoryItem, removeInventoryItem, setCurrency, toggleAttuned, toggleEquipped } from './sheetActions';

const CURRENCIES = ['pp', 'gp', 'ep', 'sp', 'cp'] as const;

/** ~Half the seeded mundane gear has no flavor text (see CLAUDE.md content-curation notes) — rather
 * than leave those items blank, synthesize a mechanical one-liner from their structured stats. */
function describeItem(item: Extract<ContentEntry, { kind: 'item' }>): string {
  if (item.data.description) return item.data.description;
  const parts: string[] = [];
  if (item.data.weapon) {
    const w = item.data.weapon;
    parts.push(`${w.damageDice} ${w.damageType}`);
    if (w.properties.length > 0) parts.push(w.properties.map(humanizeCamel).join(', '));
  } else if (item.data.armor) {
    const a = item.data.armor;
    parts.push(`AC ${a.baseAc}${a.addDexMod ? ` + Dex${a.maxDexBonus != null ? ` (max ${a.maxDexBonus})` : ''}` : ''}`);
    if (a.stealthDisadvantage) parts.push('disadvantage on Stealth');
  } else if (item.data.category === 'shield') {
    parts.push('+2 AC');
  } else {
    parts.push(humanizeCamel(item.data.category));
  }
  return parts.join(' — ');
}

export function InventoryPanel({ character, items, sheet }: { character: Character; items: ContentEntry[]; sheet: DerivedSheet }) {
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const itemById = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);

  function toggleExpanded(ref: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(ref)) next.delete(ref);
      else next.add(ref);
      return next;
    });
  }

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return items.filter((i) => i.name.toLowerCase().includes(q)).slice(0, 6);
  }, [items, query]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="mb-1.5 font-mono text-xs uppercase tracking-wider text-ink-500 dark:text-kraft-300">Currency</p>
        <div className="flex gap-3">
          {CURRENCIES.map((c) => (
            <label key={c} className="flex flex-col gap-0.5">
              <span className="font-mono text-[10px] uppercase text-ink-500 dark:text-kraft-300">{c}</span>
              <input
                type="number"
                min={0}
                value={character.state.currency[c]}
                onChange={(e) => setCurrency(character, { ...character.state.currency, [c]: Number(e.target.value) })}
                className="w-14 border-b border-dashed border-ink-900/30 bg-transparent px-1 py-0.5 font-mono text-sm outline-none focus:border-rust-500 dark:border-kraft-100/30"
              />
            </label>
          ))}
        </div>
      </div>

      <div>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Add an item…"
          className="mb-2 w-full border-b-2 border-dashed border-ink-900/30 bg-transparent px-1 py-1.5 text-sm outline-none focus:border-rust-500 dark:border-kraft-100/30"
        />
        {matches.length > 0 && (
          <ul className="mb-3 flex flex-col gap-1">
            {matches.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => {
                    addInventoryItem(character, item.id);
                    setQuery('');
                  }}
                  className="flex w-full items-center justify-between px-2 py-1 text-left text-sm hover:bg-ink-900/5 dark:hover:bg-kraft-100/5"
                >
                  <span>{item.name}</span>
                  <span className="font-mono text-xs text-rust-500">+ add</span>
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="mb-1.5 flex items-center justify-between">
          <p className="font-mono text-xs uppercase tracking-wider text-ink-500 dark:text-kraft-300">
            Inventory ({character.state.inventory.length})
          </p>
          <p
            className={`font-mono text-xs ${
              sheet.carriedWeight > sheet.carryingCapacity ? 'text-rust-500' : 'text-ink-700 dark:text-kraft-200'
            }`}
          >
            {sheet.carriedWeight} / {sheet.carryingCapacity} lb{sheet.carriedWeight > sheet.carryingCapacity ? ' — encumbered!' : ''}
          </p>
        </div>
        <ul className="divide-y-2 divide-dashed divide-ink-900/15 dark:divide-kraft-100/15">
          {character.state.inventory.map((entry) => {
            const item = entry.itemRef ? itemById.get(entry.itemRef) : undefined;
            if (!item || !entry.itemRef) return null;
            const canAttune = item.kind === 'item' && item.data.attunement !== false;
            const description = item.kind === 'item' ? describeItem(item) : undefined;
            const isOpen = expanded.has(entry.itemRef);
            return (
              <li key={entry.itemRef} className="py-2 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => toggleExpanded(entry.itemRef!)}
                    className="min-w-0 flex-1 truncate text-left hover:underline"
                  >
                    {item.name}
                    {entry.qty > 1 && <span className="ml-1 font-mono text-xs text-ink-700 dark:text-kraft-200">×{entry.qty}</span>}
                  </button>
                  <label className="flex shrink-0 items-center gap-1 font-mono text-[11px] uppercase tracking-wide">
                    <input type="checkbox" checked={entry.equipped} onChange={() => toggleEquipped(character, entry.itemRef!)} />
                    Equip
                  </label>
                  {canAttune && (
                    <label className="flex shrink-0 items-center gap-1 font-mono text-[11px] uppercase tracking-wide">
                      <input type="checkbox" checked={entry.attuned} onChange={() => toggleAttuned(character, entry.itemRef!)} />
                      Attune
                    </label>
                  )}
                  <button
                    type="button"
                    onClick={() => removeInventoryItem(character, entry.itemRef!)}
                    className="shrink-0 font-mono text-xs text-rust-500"
                  >
                    Remove
                  </button>
                </div>
                {isOpen && description && <p className="mt-1 text-xs text-ink-700 dark:text-kraft-200">{description}</p>}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
