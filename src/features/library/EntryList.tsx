import type { ContentEntry } from '@/schema/content';
import { entrySummary } from './entryMeta';

interface EntryListProps {
  entries: ContentEntry[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export function EntryList({ entries, selectedId, onSelect }: EntryListProps) {
  if (entries.length === 0) {
    return (
      <p className="border-2 border-dashed border-ink-900/25 px-4 py-8 text-center text-sm text-ink-700 dark:border-kraft-100/25 dark:text-kraft-200">
        Nothing matches. Try a different search or tab.
      </p>
    );
  }

  return (
    <ul className="divide-y-2 divide-dashed divide-ink-900/15 dark:divide-kraft-100/15">
      {entries.map((entry) => (
        <li key={entry.id}>
          <button
            type="button"
            onClick={() => onSelect(entry.id)}
            className={`flex w-full items-baseline gap-2 py-2.5 pl-1 pr-2 text-left transition-colors ${
              selectedId === entry.id
                ? 'bg-ink-900/5 dark:bg-kraft-100/10'
                : 'hover:bg-ink-900/5 dark:hover:bg-kraft-100/5'
            }`}
          >
            <span
              className={`font-mono text-sm ${
                selectedId === entry.id ? 'text-rust-500' : 'text-ink-500 dark:text-kraft-300'
              }`}
              aria-hidden
            >
              »
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">{entry.name}</span>
            </span>
            <span className="shrink-0 font-mono text-xs text-ink-700 dark:text-kraft-200">
              {entrySummary(entry)}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}
