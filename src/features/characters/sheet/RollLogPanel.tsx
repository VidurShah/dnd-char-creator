import type { Character } from '@/schema/character';

export function RollLogPanel({ character }: { character: Character }) {
  if (character.state.rollLog.length === 0) {
    return <p className="text-sm text-ink-700 dark:text-kraft-200">No rolls yet — roll a check, save, or attack to see it here.</p>;
  }

  return (
    <ul className="flex flex-col gap-1">
      {character.state.rollLog.map((entry) => (
        <li key={entry.id} className="flex items-baseline justify-between border-b border-dashed border-ink-900/10 py-1 text-sm dark:border-kraft-100/10">
          <span>{entry.label}</span>
          <span className="font-mono text-xs text-ink-700 dark:text-kraft-200">
            [{entry.rolls.join(', ')}] {entry.formula} = <span className="text-base font-semibold text-rust-500">{entry.total}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}
