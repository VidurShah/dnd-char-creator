import { useState } from 'react';
import type { DerivedFeature, FeatureSource } from '@/engine/compute';

const SECTION_ORDER: FeatureSource[] = ['class', 'subclass', 'species', 'background', 'feat'];
const SECTION_LABEL: Record<FeatureSource, string> = {
  class: 'Class Features',
  subclass: 'Subclass',
  species: 'Species Traits',
  background: 'Background',
  feat: 'Feats',
};

/** Collapses a multi-line description to a single teaser line for the closed state. */
function teaser(description: string): string {
  const firstLine = description.trim().split('\n')[0] ?? '';
  return firstLine.length > 90 ? `${firstLine.slice(0, 90).trimEnd()}…` : firstLine;
}

function FeatureRow({ feature }: { feature: DerivedFeature }) {
  const [open, setOpen] = useState(false);
  const hasBody = feature.description.trim().length > 0;
  return (
    <li className="border-b border-dashed border-ink-900/15 last:border-b-0 dark:border-kraft-100/15">
      <button
        type="button"
        onClick={() => hasBody && setOpen((v) => !v)}
        className={`flex w-full items-baseline gap-2 py-2 text-left ${hasBody ? 'hover:text-rust-500' : 'cursor-default'}`}
        aria-expanded={hasBody ? open : undefined}
      >
        {hasBody && (
          <span className="mt-0.5 shrink-0 font-mono text-xs text-ink-500 dark:text-kraft-300" aria-hidden>
            {open ? '▾' : '▸'}
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span className="font-medium">{feature.name}</span>
          {!open && hasBody && (
            <span className="ml-2 text-sm text-ink-500 dark:text-kraft-300">{teaser(feature.description)}</span>
          )}
        </span>
      </button>
      {open && hasBody && (
        <p className="whitespace-pre-line pb-3 pl-5 text-sm text-ink-700 dark:text-kraft-200">{feature.description}</p>
      )}
    </li>
  );
}

export function FeaturesPanel({ features }: { features: DerivedFeature[] }) {
  if (features.length === 0) {
    return <p className="text-sm text-ink-700 dark:text-kraft-200">No features yet.</p>;
  }

  return (
    <div className="flex flex-col gap-6">
      {SECTION_ORDER.map((source) => {
        const group = features.filter((f) => f.source === source);
        if (group.length === 0) return null;
        return (
          <div key={source}>
            <p className="mb-1 font-mono text-xs uppercase tracking-wider text-ink-500 dark:text-kraft-300">
              {SECTION_LABEL[source]} <span className="text-ink-900/30 dark:text-kraft-100/30">· {group.length}</span>
            </p>
            <ul>
              {group.map((f) => (
                <FeatureRow key={f.ref} feature={f} />
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
