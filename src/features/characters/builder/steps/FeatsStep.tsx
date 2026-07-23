import { useMemo, useState } from 'react';
import type { ContentEntry } from '@/schema/content';

interface FeatsStepProps {
  feats: ContentEntry[];
  value: string[];
  onChange: (value: string[]) => void;
  /** Advances the builder — surfaced as a top-of-list button so a long feat list
   * doesn't force scrolling to the bottom nav just to skip an optional step. */
  onNext?: () => void;
}

/** Optional — feat selection isn't gated by ASI/variant-human rules yet, so any number can be taken. */
export function FeatsStep({ feats, value, onChange, onNext }: FeatsStepProps) {
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  function toggle(id: string) {
    onChange(value.includes(id) ? value.filter((f) => f !== id) : [...value, id]);
  }
  function toggleExpanded(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
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
      <div className="flex items-center justify-between gap-3">
        <p className="font-mono text-xs uppercase tracking-wider text-ink-500 dark:text-kraft-300">
          {value.length === 0 ? 'None selected (optional)' : `${value.length} selected`}
        </p>
        {onNext && (
          <button
            type="button"
            onClick={onNext}
            className="border-2 border-ink-900 px-3 py-1 font-mono text-xs uppercase tracking-wide text-ink-900 hover:bg-ink-900 hover:text-kraft-50 dark:border-kraft-100 dark:text-kraft-100 dark:hover:bg-kraft-100 dark:hover:text-ink-900"
          >
            {value.length === 0 ? 'Skip' : 'Next'} →
          </button>
        )}
      </div>
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
          const isOpen = expanded.has(feat.id);
          return (
            <li key={feat.id} className="flex items-start gap-2 px-1 py-2">
              <button
                type="button"
                onClick={() => toggle(feat.id)}
                aria-label={active ? `Deselect ${feat.name}` : `Select ${feat.name}`}
                className={`mt-1 h-3.5 w-3.5 shrink-0 border-2 ${active ? 'border-rust-500 bg-rust-500' : 'border-ink-900/40 dark:border-kraft-100/40'}`}
              />
              <div className="min-w-0 flex-1">
                <button type="button" onClick={() => toggleExpanded(feat.id)} className="flex w-full items-baseline gap-2 text-left hover:text-rust-500">
                  <span className="font-mono text-xs text-ink-500 dark:text-kraft-300" aria-hidden>
                    {isOpen ? '▾' : '▸'}
                  </span>
                  <span className="flex-1 font-medium">{feat.name}</span>
                  {feat.data.prerequisite && (
                    <span className="shrink-0 text-xs text-ink-500 dark:text-kraft-300">Requires {feat.data.prerequisite}</span>
                  )}
                </button>
                {isOpen && feat.data.description && (
                  <p className="mt-1 pl-5 text-sm text-ink-700 dark:text-kraft-200">{feat.data.description}</p>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
