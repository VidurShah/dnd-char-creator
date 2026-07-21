import { useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import type { Edition } from '@/schema/common';
import type { ContentKind } from '@/schema/content';
import { useContentIndex } from '@/content/useContentIndex';
import { groupByKind } from '@/content/loader';
import { packRepo } from '@/db/repos';
import { PackSchema } from '@/schema/pack';
import { readJsonFile } from '@/lib/download';
import { KindBookmarks } from './KindBookmarks';
import { EntryList } from './EntryList';
import { EntryDetail } from './EntryDetail';
import { SpellFilterPanel, ItemFilterPanel } from './FilterPanel';
import {
  emptyItemFilters,
  emptySpellFilters,
  isItemFiltersEmpty,
  isSpellFiltersEmpty,
  matchesItemFilters,
  matchesSpellFilters,
} from './filters';

const EDITIONS: { id: Edition; label: string; available: boolean }[] = [
  { id: '2014', label: '5e (2014 + Tasha\'s)', available: true },
  { id: '2024', label: '5.5e (2024)', available: true },
];

export function LibraryPage() {
  const [searchParams] = useSearchParams();
  const initialEdition = searchParams.get('edition') === '2024' ? '2024' : '2014';
  const [edition, setEdition] = useState<Edition>(initialEdition);
  const [activeKind, setActiveKind] = useState<ContentKind | 'all'>('all');
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [spellFilters, setSpellFilters] = useState(emptySpellFilters());
  const [itemFilters, setItemFilters] = useState(emptyItemFilters());

  const { entries, loading, byId, searchEntries } = useContentIndex(edition);

  const kindCounts = useMemo(() => {
    const grouped = groupByKind(entries);
    return (Object.keys(grouped) as ContentKind[])
      .map((kind) => ({ kind, count: grouped[kind]?.length ?? 0 }))
      .sort((a, b) => b.count - a.count);
  }, [entries]);

  const availableClasses = useMemo(() => {
    const classes = new Set<string>();
    for (const entry of entries) {
      if (entry.kind === 'spell') for (const c of entry.data.classLists) classes.add(c);
    }
    return [...classes].sort();
  }, [entries]);

  const filtered = useMemo(() => {
    const base = query.trim() ? searchEntries(query) : entries;
    const byKind = activeKind === 'all' ? base : base.filter((e) => e.kind === activeKind);

    const byDetail = byKind.filter((entry) => {
      if (entry.kind === 'spell' && !isSpellFiltersEmpty(spellFilters)) {
        return matchesSpellFilters(entry, spellFilters);
      }
      if (entry.kind === 'item' && !isItemFiltersEmpty(itemFilters)) {
        return matchesItemFilters(entry, itemFilters);
      }
      return true;
    });

    return [...byDetail].sort((a, b) => a.name.localeCompare(b.name));
  }, [entries, query, activeKind, searchEntries, spellFilters, itemFilters]);

  const selected = selectedId ? byId.get(selectedId) : undefined;
  const showSpellFilters = activeKind === 'spell' || activeKind === 'all';
  const showItemFilters = activeKind === 'item' || activeKind === 'all';

  const fileInput = useRef<HTMLInputElement>(null);
  const [importMessage, setImportMessage] = useState<string | null>(null);

  async function handleImportPack(file: File) {
    setImportMessage(null);
    try {
      const raw = await readJsonFile(file);
      const pack = PackSchema.parse(raw);
      await packRepo.importPack(pack);
      setImportMessage(`Imported ${pack.entries.length} entries from "${pack.name}".`);
    } catch (err) {
      setImportMessage(err instanceof Error ? `Import failed: ${err.message}` : 'Import failed — check the file is a valid pack.');
    }
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
        <h1 className="font-display text-xl text-ink-900 dark:text-kraft-100">Library</h1>
        <div className="flex items-center gap-3">
          <div className="flex gap-1 border-2 border-ink-900/20 p-1 dark:border-kraft-100/20">
            {EDITIONS.map((e) => (
              <button
                key={e.id}
                type="button"
                disabled={!e.available}
                onClick={() => {
                  setEdition(e.id);
                  setSelectedId(null);
                }}
                className={`px-3 py-1.5 font-mono text-xs uppercase tracking-wide transition-colors ${
                  edition === e.id
                    ? 'bg-ink-900 text-kraft-50 dark:bg-kraft-100 dark:text-ink-900'
                    : 'text-ink-700 disabled:cursor-not-allowed disabled:opacity-40 dark:text-kraft-200'
                }`}
                title={e.available ? undefined : 'Coming in a later phase'}
              >
                {e.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            className="border-2 border-ink-900/30 px-3 py-1.5 font-mono text-xs uppercase tracking-wide text-ink-700 hover:border-ink-900/60 dark:border-kraft-100/30 dark:text-kraft-200"
          >
            Import Pack
          </button>
          <input
            ref={fileInput}
            type="file"
            accept="application/json"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleImportPack(file);
              e.target.value = '';
            }}
          />
          <Link
            to={`/library/new?edition=${edition}`}
            className="border-2 border-ink-900 bg-ink-900 px-3 py-1.5 font-mono text-xs uppercase tracking-wide text-kraft-50 dark:border-kraft-100 dark:bg-kraft-100 dark:text-ink-900"
          >
            + New Entry
          </Link>
        </div>
      </div>

      {importMessage && <p className="mb-4 text-sm text-rust-500">{importMessage}</p>}

      <KindBookmarks kinds={kindCounts} active={activeKind} onSelect={setActiveKind} />

      <hr className="rule-sketch my-5" />

      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search the library…"
        className="mb-5 w-full border-b-2 border-dashed border-ink-900/30 bg-transparent px-1 py-2 text-sm outline-none placeholder:text-ink-700/50 focus:border-rust-500 dark:border-kraft-100/30 dark:placeholder:text-kraft-200/40"
      />

      {loading ? (
        <p className="text-sm text-ink-700 dark:text-kraft-200">Loading…</p>
      ) : (
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-[200px_minmax(0,1fr)_minmax(0,1fr)]">
          <aside className="order-first lg:order-none">
            {showSpellFilters && (
              <SpellFilterPanel filters={spellFilters} onChange={setSpellFilters} availableClasses={availableClasses} />
            )}
            {showSpellFilters && showItemFilters && <hr className="rule-sketch my-4" />}
            {showItemFilters && <ItemFilterPanel filters={itemFilters} onChange={setItemFilters} />}
          </aside>

          <div className="max-h-[70vh] overflow-y-auto">
            <EntryList entries={filtered} selectedId={selectedId} onSelect={setSelectedId} byId={byId} />
          </div>

          <div>
            {selected ? (
              <EntryDetail entry={selected} byId={byId} />
            ) : (
              <p className="text-sm text-ink-700 dark:text-kraft-200">Select an entry to see its full details.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
