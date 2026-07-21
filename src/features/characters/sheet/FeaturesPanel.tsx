import type { DerivedFeature, FeatureSource } from '@/engine/compute';

const SECTION_ORDER: FeatureSource[] = ['class', 'subclass', 'species', 'background', 'feat'];
const SECTION_LABEL: Record<FeatureSource, string> = {
  class: 'Class Features',
  subclass: 'Subclass',
  species: 'Species Traits',
  background: 'Background',
  feat: 'Feats',
};

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
            <p className="mb-2 font-mono text-xs uppercase tracking-wider text-ink-500 dark:text-kraft-300">
              {SECTION_LABEL[source]}
            </p>
            <ul className="flex flex-col gap-4">
              {group.map((f) => (
                <li key={f.ref}>
                  <h3 className="font-medium">{f.name}</h3>
                  <p className="mt-1 whitespace-pre-line text-sm text-ink-700 dark:text-kraft-200">{f.description}</p>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
