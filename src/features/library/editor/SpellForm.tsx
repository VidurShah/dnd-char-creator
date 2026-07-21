import type { SpellPayload } from '@/schema/content';
import { SPELL_SCHOOLS } from '@/features/library/filters';

interface SpellFormProps {
  value: SpellPayload;
  onChange: (value: SpellPayload) => void;
}

export function SpellForm({ value, onChange }: SpellFormProps) {
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-4">
        <label className="flex flex-col gap-1">
          <span className="font-mono text-xs uppercase tracking-wider text-ink-500 dark:text-kraft-300">Level (0 = cantrip)</span>
          <input
            type="number"
            min={0}
            max={9}
            value={value.level}
            onChange={(e) => onChange({ ...value, level: Number(e.target.value) })}
            className="border-b-2 border-dashed border-ink-900/30 bg-transparent px-1 py-1 outline-none focus:border-rust-500 dark:border-kraft-100/30"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="font-mono text-xs uppercase tracking-wider text-ink-500 dark:text-kraft-300">School</span>
          <select
            value={value.school}
            onChange={(e) => onChange({ ...value, school: e.target.value as SpellPayload['school'] })}
            className="border-b-2 border-dashed border-ink-900/30 bg-transparent px-1 py-1 outline-none focus:border-rust-500 dark:border-kraft-100/30"
          >
            {SPELL_SCHOOLS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="font-mono text-xs uppercase tracking-wider text-ink-500 dark:text-kraft-300">Casting Time</span>
          <input
            type="text"
            value={value.castingTime}
            onChange={(e) => onChange({ ...value, castingTime: e.target.value })}
            className="border-b-2 border-dashed border-ink-900/30 bg-transparent px-1 py-1 outline-none focus:border-rust-500 dark:border-kraft-100/30"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="font-mono text-xs uppercase tracking-wider text-ink-500 dark:text-kraft-300">Range</span>
          <input
            type="text"
            value={value.range}
            onChange={(e) => onChange({ ...value, range: e.target.value })}
            className="border-b-2 border-dashed border-ink-900/30 bg-transparent px-1 py-1 outline-none focus:border-rust-500 dark:border-kraft-100/30"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="font-mono text-xs uppercase tracking-wider text-ink-500 dark:text-kraft-300">Duration</span>
          <input
            type="text"
            value={value.duration}
            onChange={(e) => onChange({ ...value, duration: e.target.value })}
            className="border-b-2 border-dashed border-ink-900/30 bg-transparent px-1 py-1 outline-none focus:border-rust-500 dark:border-kraft-100/30"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="font-mono text-xs uppercase tracking-wider text-ink-500 dark:text-kraft-300">Classes (comma-separated)</span>
          <input
            type="text"
            value={value.classLists.join(', ')}
            onChange={(e) => onChange({ ...value, classLists: e.target.value.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean) })}
            placeholder="wizard, sorcerer"
            className="border-b-2 border-dashed border-ink-900/30 bg-transparent px-1 py-1 outline-none focus:border-rust-500 dark:border-kraft-100/30"
          />
        </label>
      </div>

      <div className="flex gap-4">
        <label className="flex items-center gap-1.5 text-sm">
          <input type="checkbox" checked={value.components.verbal} onChange={(e) => onChange({ ...value, components: { ...value.components, verbal: e.target.checked } })} />
          Verbal
        </label>
        <label className="flex items-center gap-1.5 text-sm">
          <input type="checkbox" checked={value.components.somatic} onChange={(e) => onChange({ ...value, components: { ...value.components, somatic: e.target.checked } })} />
          Somatic
        </label>
        <label className="flex flex-1 items-center gap-1.5 text-sm">
          Material:
          <input
            type="text"
            value={value.components.material ?? ''}
            onChange={(e) => onChange({ ...value, components: { ...value.components, material: e.target.value || undefined } })}
            placeholder="(none)"
            className="flex-1 border-b border-dashed border-ink-900/30 bg-transparent px-1 outline-none focus:border-rust-500 dark:border-kraft-100/30"
          />
        </label>
      </div>

      <div className="flex gap-4">
        <label className="flex items-center gap-1.5 text-sm">
          <input type="checkbox" checked={value.concentration} onChange={(e) => onChange({ ...value, concentration: e.target.checked })} />
          Concentration
        </label>
        <label className="flex items-center gap-1.5 text-sm">
          <input type="checkbox" checked={value.ritual} onChange={(e) => onChange({ ...value, ritual: e.target.checked })} />
          Ritual
        </label>
      </div>

      <label className="flex flex-col gap-1">
        <span className="font-mono text-xs uppercase tracking-wider text-ink-500 dark:text-kraft-300">Description</span>
        <textarea
          value={value.description}
          onChange={(e) => onChange({ ...value, description: e.target.value })}
          rows={5}
          className="border-2 border-ink-900/20 bg-transparent p-2 text-sm outline-none focus:border-rust-500 dark:border-kraft-100/20"
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="font-mono text-xs uppercase tracking-wider text-ink-500 dark:text-kraft-300">At Higher Levels (optional)</span>
        <textarea
          value={value.higherLevels ?? ''}
          onChange={(e) => onChange({ ...value, higherLevels: e.target.value || undefined })}
          rows={2}
          className="border-2 border-ink-900/20 bg-transparent p-2 text-sm outline-none focus:border-rust-500 dark:border-kraft-100/20"
        />
      </label>
    </div>
  );
}
