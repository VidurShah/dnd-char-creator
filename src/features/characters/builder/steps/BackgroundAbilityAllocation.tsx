import type { Ability } from '@/schema/common';
import { ABILITY_LABEL } from '../builderState';

interface BackgroundAbilityAllocationProps {
  options: Ability[];
  value: Partial<Record<Ability, number>>;
  onChange: (value: Partial<Record<Ability, number>>) => void;
}

const TOTAL_POINTS = 3;
const MAX_PER_ABILITY = 2;

/** 2024 rule: split +3 across these abilities as +2/+1 or +1/+1/+1 — this replaces species ability bonuses. */
export function BackgroundAbilityAllocation({ options, value, onChange }: BackgroundAbilityAllocationProps) {
  const spent = options.reduce((sum, a) => sum + (value[a] ?? 0), 0);
  const remaining = TOTAL_POINTS - spent;

  function adjust(ability: Ability, delta: number) {
    const current = value[ability] ?? 0;
    const next = current + delta;
    if (next < 0 || next > MAX_PER_ABILITY) return;
    if (delta > 0 && remaining <= 0) return;
    onChange({ ...value, [ability]: next });
  }

  return (
    <div className="mt-4 border-t-2 border-dashed border-ink-900/15 pt-4 dark:border-kraft-100/15">
      <p className="mb-2 font-mono text-xs uppercase tracking-wider text-ink-500 dark:text-kraft-300">
        Allocate +3 ({remaining} remaining) — up to +2 in one ability
      </p>
      <div className="flex gap-4">
        {options.map((ability) => (
          <div key={ability} className="flex items-center gap-2">
            <span className="w-24 text-sm">{ABILITY_LABEL[ability]}</span>
            <button
              type="button"
              onClick={() => adjust(ability, -1)}
              className="h-6 w-6 border border-ink-900/30 font-mono dark:border-kraft-100/30"
            >
              −
            </button>
            <span className="w-6 text-center font-mono">+{value[ability] ?? 0}</span>
            <button
              type="button"
              onClick={() => adjust(ability, 1)}
              className="h-6 w-6 border border-ink-900/30 font-mono dark:border-kraft-100/30"
            >
              +
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
