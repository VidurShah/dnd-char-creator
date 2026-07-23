import type { ContentEntry } from '@/schema/content';

interface SpellsStepProps {
  cantrips: ContentEntry[];
  leveledSpells: ContentEntry[];
  cantripCap: number;
  leveledCap: number;
  /** Heading for the leveled-spell section — "Spells Known", "Spellbook", or "Prepared Spells". */
  leveledLabel?: string;
  value: string[];
  onChange: (value: string[]) => void;
}

export function SpellsStep({ cantrips, leveledSpells, cantripCap, leveledCap, leveledLabel = '1st-Level Spells', value, onChange }: SpellsStepProps) {
  const chosenCantrips = value.filter((id) => cantrips.some((s) => s.id === id));
  const chosenLeveled = value.filter((id) => leveledSpells.some((s) => s.id === id));

  function toggle(id: string, cap: number, chosen: string[]) {
    if (value.includes(id)) {
      onChange(value.filter((v) => v !== id));
    } else if (chosen.length < cap) {
      onChange([...value, id]);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="mb-2 font-mono text-xs uppercase tracking-wider text-ink-500 dark:text-kraft-300">
          Cantrips ({chosenCantrips.length}/{cantripCap})
        </p>
        <SpellList entries={cantrips} selected={value} onToggle={(id) => toggle(id, cantripCap, chosenCantrips)} />
      </div>
      {leveledCap > 0 && (
        <div>
          <p className="mb-2 font-mono text-xs uppercase tracking-wider text-ink-500 dark:text-kraft-300">
            {leveledLabel} ({chosenLeveled.length}/{leveledCap})
          </p>
          <SpellList entries={leveledSpells} selected={value} onToggle={(id) => toggle(id, leveledCap, chosenLeveled)} />
        </div>
      )}
    </div>
  );
}

function SpellList({
  entries,
  selected,
  onToggle,
}: {
  entries: ContentEntry[];
  selected: string[];
  onToggle: (id: string) => void;
}) {
  if (entries.length === 0) {
    return <p className="text-sm text-ink-700 dark:text-kraft-200">Nothing available.</p>;
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {entries.map((entry) => {
        const active = selected.includes(entry.id);
        return (
          <button
            key={entry.id}
            type="button"
            onClick={() => onToggle(entry.id)}
            className={`rounded-sm border px-2 py-1 text-xs ${
              active
                ? 'border-ink-900 bg-ink-900 text-kraft-50 dark:border-kraft-100 dark:bg-kraft-100 dark:text-ink-900'
                : 'border-ink-900/25 text-ink-700 hover:border-ink-900/50 dark:border-kraft-100/25 dark:text-kraft-200'
            }`}
          >
            {entry.name}
          </button>
        );
      })}
    </div>
  );
}
