import type { ContentEntry } from '@/schema/content';
import type { ClassGuidance } from '@/schema/guidance';

interface SubclassStepProps {
  subclasses: ContentEntry[];
  value?: string;
  onChange: (id: string | undefined) => void;
  guidance?: ClassGuidance;
}

/** Optional at creation — many subclasses aren't chosen until level 2 or 3 anyway. */
export function SubclassStep({ subclasses, value, onChange, guidance }: SubclassStepProps) {
  if (subclasses.length === 0) {
    return <p className="text-sm text-ink-700 dark:text-kraft-200">No subclass options seeded for this class yet — skip ahead.</p>;
  }

  return (
    <ul className="divide-y-2 divide-dashed divide-ink-900/15 dark:divide-kraft-100/15">
      <li>
        <button
          type="button"
          onClick={() => onChange(undefined)}
          className={`flex w-full items-center gap-3 px-2 py-3 text-left transition-colors ${
            value == null ? 'bg-ink-900/5 dark:bg-kraft-100/10' : 'hover:bg-ink-900/5 dark:hover:bg-kraft-100/5'
          }`}
        >
          <span
            className={`h-3 w-3 shrink-0 rounded-full border-2 ${value == null ? 'border-rust-500 bg-rust-500' : 'border-ink-900/40 dark:border-kraft-100/40'}`}
            aria-hidden
          />
          <span className="italic text-ink-700 dark:text-kraft-200">Decide later</span>
        </button>
      </li>
      {subclasses.map((entry) => {
        const recommended = guidance?.subclasses.find((s) => s.subclassRef === entry.id);
        return (
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
                <span className="block font-medium">
                  {entry.name}
                  {recommended && <span className="ml-1.5 text-xs text-rust-500">★ Recommended</span>}
                </span>
                {entry.kind === 'subclass' && entry.data.description && (
                  <span className="block text-xs text-ink-700 dark:text-kraft-200">{entry.data.description}</span>
                )}
                {recommended && <span className="mt-0.5 block text-xs italic text-ink-700 dark:text-kraft-200">{recommended.rationale}</span>}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
