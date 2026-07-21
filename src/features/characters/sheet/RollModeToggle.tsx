import type { AdvantageMode } from '@/engine/dice';

const MODES: { id: AdvantageMode; label: string }[] = [
  { id: 'advantage', label: 'Adv' },
  { id: 'normal', label: 'Normal' },
  { id: 'disadvantage', label: 'Dis' },
];

interface RollModeToggleProps {
  mode: AdvantageMode;
  onChange: (mode: AdvantageMode) => void;
  forcedDisadvantageReason?: string;
}

/** A roll-mode picker applied to whichever roll button is clicked next in this panel. */
export function RollModeToggle({ mode, onChange, forcedDisadvantageReason }: RollModeToggleProps) {
  return (
    <div className="mb-3 flex items-center gap-2">
      <span className="font-mono text-xs uppercase tracking-wider text-ink-500 dark:text-kraft-300">Roll mode</span>
      <div className="flex gap-1 border-2 border-ink-900/20 p-0.5 dark:border-kraft-100/20">
        {MODES.map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() => onChange(m.id)}
            className={`px-2 py-0.5 font-mono text-[11px] uppercase tracking-wide ${
              mode === m.id
                ? 'bg-ink-900 text-kraft-50 dark:bg-kraft-100 dark:text-ink-900'
                : 'text-ink-700 dark:text-kraft-200'
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>
      {forcedDisadvantageReason && (
        <span className="text-xs italic text-rust-500">{forcedDisadvantageReason}</span>
      )}
    </div>
  );
}
