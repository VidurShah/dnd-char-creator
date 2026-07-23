import { useState } from 'react';
import type { DerivedFeature } from '@/engine/compute';

interface SelectionPreviewProps {
  /** The selected entry's own blurb (species/class description), if any. */
  description?: string;
  /** Features the current build derives from this selection (already scoped by the caller). */
  features: DerivedFeature[];
}

function FeatureItem({ feature }: { feature: DerivedFeature }) {
  const [open, setOpen] = useState(false);
  const hasBody = feature.description.trim().length > 0;
  return (
    <li>
      <button
        type="button"
        onClick={() => hasBody && setOpen((v) => !v)}
        className={`flex w-full items-baseline gap-1.5 py-1 text-left text-sm ${hasBody ? 'hover:text-rust-500' : 'cursor-default'}`}
      >
        {hasBody && <span className="font-mono text-[10px] text-ink-500 dark:text-kraft-300" aria-hidden>{open ? '▾' : '▸'}</span>}
        <span className="font-medium">{feature.name}</span>
      </button>
      {open && hasBody && <p className="whitespace-pre-line pb-2 pl-4 text-xs text-ink-700 dark:text-kraft-200">{feature.description}</p>}
    </li>
  );
}

/**
 * The small "here's what you just picked" panel shown under a species/class
 * choice in the builder — a short blurb plus the features that selection grants,
 * each collapsed to a clickable name so the box stays compact.
 */
export function SelectionPreview({ description, features }: SelectionPreviewProps) {
  const [showFull, setShowFull] = useState(false);
  if (!description && features.length === 0) return null;

  const long = (description?.length ?? 0) > 220;
  const blurb = description && long && !showFull ? `${description.slice(0, 220).trimEnd()}…` : description;

  return (
    <div className="mt-3 border-l-2 border-olive-500/50 pl-3">
      {description && (
        <p className="whitespace-pre-line text-sm text-ink-700 dark:text-kraft-200">
          {blurb}{' '}
          {long && (
            <button type="button" onClick={() => setShowFull((v) => !v)} className="font-mono text-xs text-rust-500 hover:underline">
              {showFull ? 'less' : 'more'}
            </button>
          )}
        </p>
      )}
      {features.length > 0 && (
        <ul className="mt-2">
          {features.map((f) => (
            <FeatureItem key={f.ref} feature={f} />
          ))}
        </ul>
      )}
    </div>
  );
}
