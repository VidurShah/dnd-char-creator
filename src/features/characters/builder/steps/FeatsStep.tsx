import { useMemo, useState } from 'react';
import type { ContentEntry } from '@/schema/content';

interface FeatsStepProps {
  feats: ContentEntry[];
  value: string[];
  onChange: (value: string[]) => void;
}

/** Optional — feat selection isn't gated by ASI/variant-human rules yet, so any number can be taken. */
export function FeatsStep({ feats, value, onChange }: FeatsStepProps) {
  const [query, setQuery] = useState('');

  function toggle(id: string) {
    onChange(value.includes(id) ? value.filter((f) => f !== id) : [...value, id]);
  }

  const visibleFeats = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return feats;
    return feats.filter((f) => f.name.toLowerCase().includes(q));
  }, [feats, query]);

  if (feats.length === 0) {
    return <p className="text-sm text-ink-700 dark:text-kraft-200">No feats available in this edition yet — skip ahead.</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search feats…"
        className="w-full border-b-2 border-dashed border-ink-900/30 bg-transparent px-1 py-1.5 text-sm outline-none focus:border-rust-500 dark:border-kraft-100/30"
      />
      {visibleFeats.length === 0 && <p className="text-sm text-ink-700 dark:text-kraft-200">No feats match "{query}".</p>}
      <ul className="divide-y-2 divide-dashed divide-ink-900/15 dark:divide-kraft-100/15">
        {visibleFeats.map((feat) => {
          if (feat.kind !== 'feat') return null;
          const active = value.includes(feat.id);
          return (
            <li key={feat.id}>
              <button
                type="button"
                onClick={() => toggle(feat.id)}
                className={`flex w-full items-start gap-3 px-2 py-3 text-left transition-colors ${
                  active ? 'bg-ink-900/5 dark:bg-kraft-100/10' : 'hover:bg-ink-900/5 dark:hover:bg-kraft-100/5'
                }`}
              >
                <span
                  className={`mt-1 h-3 w-3 shrink-0 border-2 ${active ? 'border-rust-500 bg-rust-500' : 'border-ink-900/40 dark:border-kraft-100/40'}`}
                  aria-hidden
                />
                <span>
                  <span className="block font-medium">{feat.name}</span>
                  {feat.data.prerequisite && (
                    <span className="block text-xs text-ink-700 dark:text-kraft-200">Requires {feat.data.prerequisite}</span>
                  )}
                  {feat.data.description && <span className="mt-1 block text-sm text-ink-700 dark:text-kraft-200">{feat.data.description}</span>}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
