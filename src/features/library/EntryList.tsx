import { useMemo, useState } from 'react';
import type { ContentEntry } from '@/schema/content';
import { entrySummary } from './entryMeta';

interface EntryListProps {
  entries: ContentEntry[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  /** Full content index, used to resolve a derivative's parent name. */
  byId?: Map<string, ContentEntry>;
}

/** The ref a subclass/subspecies derives from, if it is a derivative at all. */
function parentRefOf(entry: ContentEntry): string | undefined {
  if (entry.kind === 'subclass') return entry.data.parentClassRef;
  if (entry.kind === 'species') return entry.data.parentSpeciesRef;
  return undefined;
}

interface Group {
  /** Parent ref, or null for entries that aren't derivatives of anything. */
  parentRef: string | null;
  parentName: string;
  /** The parent's own entry, when it's in this list and therefore selectable. */
  parentEntry?: ContentEntry;
  children: ContentEntry[];
}

/**
 * Groups derivatives (subclasses, subspecies) under the thing they derive from,
 * so a list reads as "Elf -> High Elf, Wood Elf, Drow" rather than as a flat
 * alphabetical run where a subrace sits nowhere near its base species.
 *
 * The parent is often not in the same list — the Library filters classes and
 * subclasses into separate tabs — so the group header falls back to the parent's
 * name resolved from the index, and is only clickable when the parent is present.
 */
function groupEntries(entries: ContentEntry[], byId?: Map<string, ContentEntry>): Group[] {
  const standalone: ContentEntry[] = [];
  const childrenByParent = new Map<string, ContentEntry[]>();

  for (const entry of entries) {
    const parentRef = parentRefOf(entry);
    if (!parentRef) standalone.push(entry);
    else {
      if (!childrenByParent.has(parentRef)) childrenByParent.set(parentRef, []);
      childrenByParent.get(parentRef)!.push(entry);
    }
  }

  const groups: Group[] = [];
  const consumedAsParent = new Set<string>();

  for (const entry of standalone) {
    const children = childrenByParent.get(entry.id) ?? [];
    if (children.length > 0) consumedAsParent.add(entry.id);
    groups.push({ parentRef: entry.id, parentName: entry.name, parentEntry: entry, children });
  }

  // Derivatives whose parent isn't in this list (e.g. the Subclasses tab) still
  // group — under a plain, non-selectable header. Sorted by name because these
  // are built from map iteration order, not from the already-sorted entry list.
  const headerOnly: Group[] = [];
  for (const [parentRef, children] of childrenByParent) {
    if (consumedAsParent.has(parentRef)) continue;
    if (standalone.some((e) => e.id === parentRef)) continue;
    headerOnly.push({
      parentRef,
      parentName: byId?.get(parentRef)?.name ?? (parentRef.split('/').pop() ?? parentRef),
      children,
    });
  }
  headerOnly.sort((a, b) => a.parentName.localeCompare(b.parentName));

  return [...groups, ...headerOnly];
}

function EntryRow({
  entry,
  selectedId,
  onSelect,
  indented,
}: {
  entry: ContentEntry;
  selectedId: string | null;
  onSelect: (id: string) => void;
  indented?: boolean;
}) {
  const selected = selectedId === entry.id;
  return (
    <button
      type="button"
      onClick={() => onSelect(entry.id)}
      className={`flex w-full items-baseline gap-2 py-2.5 pr-2 text-left transition-colors ${
        indented ? 'pl-6' : 'pl-1'
      } ${selected ? 'bg-ink-900/5 dark:bg-kraft-100/10' : 'hover:bg-ink-900/5 dark:hover:bg-kraft-100/5'}`}
    >
      <span
        className={`font-mono text-sm ${selected ? 'text-rust-500' : 'text-ink-500 dark:text-kraft-300'}`}
        aria-hidden
      >
        {indented ? '└' : '»'}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{entry.name}</span>
      </span>
      <span className="shrink-0 font-mono text-xs text-ink-700 dark:text-kraft-200">{entrySummary(entry)}</span>
    </button>
  );
}

export function EntryList({ entries, selectedId, onSelect, byId }: EntryListProps) {
  const groups = useMemo(() => groupEntries(entries, byId), [entries, byId]);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  function toggle(parentRef: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(parentRef)) next.delete(parentRef);
      else next.add(parentRef);
      return next;
    });
  }

  if (entries.length === 0) {
    return (
      <p className="border-2 border-dashed border-ink-900/25 px-4 py-8 text-center text-sm text-ink-700 dark:border-kraft-100/25 dark:text-kraft-200">
        Nothing matches. Try a different search or tab.
      </p>
    );
  }

  return (
    <ul className="divide-y-2 divide-dashed divide-ink-900/15 dark:divide-kraft-100/15">
      {groups.map((group) => {
        const key = group.parentRef ?? group.parentName;
        const isCollapsed = collapsed.has(key);
        const hasChildren = group.children.length > 0;

        return (
          <li key={key}>
            <div className="flex items-center">
              {hasChildren && (
                <button
                  type="button"
                  onClick={() => toggle(key)}
                  aria-expanded={!isCollapsed}
                  aria-label={`${isCollapsed ? 'Expand' : 'Collapse'} ${group.parentName}`}
                  className="shrink-0 px-1 py-2.5 font-mono text-xs text-ink-500 hover:text-rust-500 dark:text-kraft-300"
                >
                  {isCollapsed ? '▸' : '▾'}
                </button>
              )}
              <div className="min-w-0 flex-1">
                {group.parentEntry ? (
                  <EntryRow entry={group.parentEntry} selectedId={selectedId} onSelect={onSelect} />
                ) : (
                  // Parent lives in another tab — a label, not a selectable entry.
                  <span className="block py-2.5 pl-1 pr-2 font-mono text-[11px] font-semibold uppercase tracking-wider text-olive-500">
                    {group.parentName}
                  </span>
                )}
              </div>
            </div>

            {hasChildren && !isCollapsed && (
              <ul>
                {group.children.map((child) => (
                  <li key={child.id}>
                    <EntryRow entry={child} selectedId={selectedId} onSelect={onSelect} indented />
                  </li>
                ))}
              </ul>
            )}
          </li>
        );
      })}
    </ul>
  );
}
