import type { Character } from '@/schema/character';
import type { DerivedSheet } from '@/engine/compute';
import { humanizeCamel, humanizeSlug } from '@/lib/text';
import { setLanguages, setPersonalityField } from './sheetActions';

const PERSONALITY_FIELDS = [
  { key: 'alignment', label: 'Alignment' },
  { key: 'personalityTraits', label: 'Personality Traits' },
  { key: 'ideals', label: 'Ideals' },
  { key: 'bonds', label: 'Bonds' },
  { key: 'flaws', label: 'Flaws' },
  { key: 'notes', label: 'Backstory / Notes' },
] as const;

export function LorePanel({ character, sheet }: { character: Character; sheet: DerivedSheet }) {
  const { tools, weapons, armor } = sheet.proficiencies;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="mb-1.5 font-mono text-xs uppercase tracking-wider text-ink-500 dark:text-kraft-300">Languages</p>
        <input
          type="text"
          defaultValue={character.state.languages}
          onBlur={(e) => setLanguages(character, e.target.value)}
          placeholder="Common, Dwarvish…"
          className="w-full border-b-2 border-dashed border-ink-900/30 bg-transparent px-1 py-1.5 text-sm outline-none focus:border-rust-500 dark:border-kraft-100/30"
        />
      </div>

      {(tools.length > 0 || weapons.length > 0 || armor.length > 0 || sheet.movementModes.length > 0) && (
        <div className="flex flex-col gap-1.5">
          <p className="font-mono text-xs uppercase tracking-wider text-ink-500 dark:text-kraft-300">Proficiencies &amp; Movement</p>
          {armor.length > 0 && <p className="text-sm">Armor: {armor.map(humanizeSlug).join(', ')}</p>}
          {weapons.length > 0 && <p className="text-sm">Weapons: {weapons.map(humanizeSlug).join(', ')}</p>}
          {tools.length > 0 && <p className="text-sm">Tools: {tools.map(humanizeSlug).join(', ')}</p>}
          {sheet.movementModes.map((m) => (
            <p key={m.mode} className="text-sm">
              {humanizeCamel(m.mode)}: {m.value} ft
            </p>
          ))}
        </div>
      )}

      <div className="flex flex-col gap-3">
        <p className="font-mono text-xs uppercase tracking-wider text-ink-500 dark:text-kraft-300">Personality</p>
        {PERSONALITY_FIELDS.map(({ key, label }) => (
          <label key={key} className="flex flex-col gap-1">
            <span className="text-xs text-ink-500 dark:text-kraft-300">{label}</span>
            <textarea
              defaultValue={character.state[key]}
              onBlur={(e) => setPersonalityField(character, key, e.target.value)}
              rows={key === 'notes' ? 4 : 2}
              className="w-full resize-y border-b-2 border-dashed border-ink-900/30 bg-transparent px-1 py-1.5 text-sm outline-none focus:border-rust-500 dark:border-kraft-100/30"
            />
          </label>
        ))}
      </div>
    </div>
  );
}
