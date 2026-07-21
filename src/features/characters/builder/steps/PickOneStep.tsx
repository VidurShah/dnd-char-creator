import type { ContentEntry } from '@/schema/content';

interface PickOneStepProps {
  entries: ContentEntry[];
  value?: string;
  onChange: (id: string) => void;
  describe: (entry: ContentEntry) => string;
}

/** Generic single-select list used for species/class/background/subclass pickers. */
export function PickOneStep({ entries, value, onChange, describe }: PickOneStepProps) {
  return (
    <ul className="divide-y-2 divide-dashed divide-ink-900/15 dark:divide-kraft-100/15">
      {entries.map((entry) => (
        <li key={entry.id}>
          <button
            type="button"
            onClick={() => onChange(entry.id)}
            className={`flex w-full items-start gap-3 px-2 py-3 text-left transition-colors ${
              value === entry.id ? 'bg-ink-900/5 dark:bg-kraft-100/10' : 'hover:bg-ink-900/5 dark:hover:bg-kraft-100/5'
            }`}
          >
            <span
              className={`mt-1 h-3 w-3 shrink-0 rounded-full border-2 ${
                value === entry.id ? 'border-rust-500 bg-rust-500' : 'border-ink-900/40 dark:border-kraft-100/40'
              }`}
              aria-hidden
            />
            <span>
              <span className="block font-medium">{entry.name}</span>
              <span className="block text-xs text-ink-700 dark:text-kraft-200">{describe(entry)}</span>
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}
