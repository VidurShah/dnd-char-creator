import type { Ability } from '@/schema/common';
import { ABILITY_LABEL, ABILITY_ORDER, STANDARD_ARRAY } from '../builderState';

interface AbilitiesStepProps {
  value: Record<Ability, number>;
  onChange: (value: Record<Ability, number>) => void;
}

export function AbilitiesStep({ value, onChange }: AbilitiesStepProps) {
  function fillStandardArray() {
    const next = { ...value };
    ABILITY_ORDER.forEach((ability, i) => {
      next[ability] = STANDARD_ARRAY[i];
    });
    onChange(next);
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-ink-700 dark:text-kraft-200">
          Set the six ability scores. Racial bonuses are applied automatically.
        </p>
        <button
          type="button"
          onClick={fillStandardArray}
          className="border-2 border-ink-900/30 px-3 py-1.5 font-mono text-xs uppercase tracking-wide text-ink-700 hover:border-ink-900/60 dark:border-kraft-100/30 dark:text-kraft-200"
        >
          Fill standard array
        </button>
      </div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        {ABILITY_ORDER.map((ability) => (
          <label key={ability} className="flex flex-col gap-1">
            <span className="font-mono text-xs uppercase tracking-wider text-ink-500 dark:text-kraft-300">
              {ABILITY_LABEL[ability]}
            </span>
            <input
              type="number"
              min={3}
              max={20}
              value={value[ability]}
              onChange={(e) => onChange({ ...value, [ability]: Number(e.target.value) })}
              className="border-b-2 border-dashed border-ink-900/30 bg-transparent px-1 py-1 text-lg font-mono outline-none focus:border-rust-500 dark:border-kraft-100/30"
            />
          </label>
        ))}
      </div>
    </div>
  );
}
