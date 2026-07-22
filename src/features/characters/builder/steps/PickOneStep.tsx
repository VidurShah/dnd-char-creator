import { useMemo } from 'react';
import type { ContentEntry } from '@/schema/content';

interface PickOneStepProps {
  entries: ContentEntry[];
  value?: string;
  onChange: (id: string) => void;
  describe: (entry: ContentEntry) => string;
  /**
   * Returns the entry a derivative belongs under, if any. When supplied, the
   * list collapses derivatives into one row per parent with a dropdown to pick
   * the variant — so a player chooses "Elf" and then which kind of elf, rather
   * than scrolling a flat list where Wood Elf sits nowhere near Elf.
   */
  parentRefOf?: (entry: ContentEntry) => string | undefined;
  /** Label for the parent's own option in the variant dropdown (e.g. "Standard"). */
  baseOptionLabel?: (entry: ContentEntry) => string;
}

interface Group {
  base: ContentEntry;
  variants: ContentEntry[];
}

/** Generic single-select list used for species/class/background/subclass pickers. */
export function PickOneStep({
  entries,
  value,
  onChange,
  describe,
  parentRefOf,
  baseOptionLabel,
}: PickOneStepProps) {
  const groups = useMemo<Group[]>(() => {
    if (!parentRefOf) return entries.map((base) => ({ base, variants: [] }));

    const childrenByParent = new Map<string, ContentEntry[]>();
    const bases: ContentEntry[] = [];
    for (const entry of entries) {
      const parent = parentRefOf(entry);
      if (!parent) bases.push(entry);
      else {
        if (!childrenByParent.has(parent)) childrenByParent.set(parent, []);
        childrenByParent.get(parent)!.push(entry);
      }
    }

    const result = bases.map((base) => ({ base, variants: childrenByParent.get(base.id) ?? [] }));
    // A derivative whose parent isn't in this list still has to be pickable, or
    // it would silently vanish from the builder.
    for (const [parent, children] of childrenByParent) {
      if (bases.some((b) => b.id === parent)) continue;
      for (const child of children) result.push({ base: child, variants: [] });
    }
    return result;
  }, [entries, parentRefOf]);

  return (
    <ul className="divide-y-2 divide-dashed divide-ink-900/15 dark:divide-kraft-100/15">
      {groups.map(({ base, variants }) => {
        // The group counts as selected when the base or any of its variants is.
        const selectedInGroup = value === base.id ? base : variants.find((v) => v.id === value);
        const isSelected = selectedInGroup != null;
        // Clicking the row selects whatever the dropdown is currently showing.
        const activeId = selectedInGroup?.id ?? base.id;
        const shown = selectedInGroup ?? base;

        return (
          <li key={base.id} className={isSelected ? 'bg-ink-900/5 dark:bg-kraft-100/10' : ''}>
            <div className="flex items-start gap-3 px-2 py-3">
              <button
                type="button"
                onClick={() => onChange(activeId)}
                className="flex flex-1 items-start gap-3 text-left"
              >
                <span
                  className={`mt-1 h-3 w-3 shrink-0 rounded-full border-2 ${
                    isSelected ? 'border-rust-500 bg-rust-500' : 'border-ink-900/40 dark:border-kraft-100/40'
                  }`}
                  aria-hidden
                />
                <span>
                  <span className="block font-medium">
                    {base.name}
                    {isSelected && selectedInGroup.id !== base.id && (
                      <span className="ml-2 font-normal text-ink-700 dark:text-kraft-200">
                        — {selectedInGroup.name}
                      </span>
                    )}
                  </span>
                  <span className="block text-xs text-ink-700 dark:text-kraft-200">{describe(shown)}</span>
                </span>
              </button>

              {variants.length > 0 && (
                <select
                  aria-label={`${base.name} variant`}
                  value={activeId}
                  onChange={(e) => onChange(e.target.value)}
                  className="mt-0.5 shrink-0 border-2 border-ink-900/30 bg-transparent px-2 py-1 font-mono text-xs uppercase tracking-wide text-ink-700 dark:border-kraft-100/30 dark:text-kraft-200"
                >
                  <option value={base.id}>{baseOptionLabel?.(base) ?? base.name}</option>
                  {variants.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name}
                    </option>
                  ))}
                </select>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
