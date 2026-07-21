const ALIGNMENTS = [
  'Lawful Good',
  'Neutral Good',
  'Chaotic Good',
  'Lawful Neutral',
  'True Neutral',
  'Chaotic Neutral',
  'Lawful Evil',
  'Neutral Evil',
  'Chaotic Evil',
];

export interface PersonalityDraft {
  alignment: string;
  personalityTraits: string;
  ideals: string;
  bonds: string;
  flaws: string;
  notes: string;
}

interface PersonalityStepProps {
  value: PersonalityDraft;
  onChange: (value: PersonalityDraft) => void;
}

function Field({ label, hint, value, onChange }: { label: string; hint: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="font-mono text-xs uppercase tracking-wider text-ink-500 dark:text-kraft-300">{label}</span>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={hint}
        rows={2}
        className="w-full resize-y border-b-2 border-dashed border-ink-900/30 bg-transparent px-1 py-1.5 text-sm outline-none focus:border-rust-500 dark:border-kraft-100/30"
      />
    </label>
  );
}

/** Entirely optional flavor — nothing here affects computed stats, all freeform. */
export function PersonalityStep({ value, onChange }: PersonalityStepProps) {
  function set<K extends keyof PersonalityDraft>(key: K, v: PersonalityDraft[K]) {
    onChange({ ...value, [key]: v });
  }

  return (
    <div className="flex flex-col gap-5">
      <label className="flex flex-col gap-1">
        <span className="font-mono text-xs uppercase tracking-wider text-ink-500 dark:text-kraft-300">Alignment</span>
        <select
          value={value.alignment}
          onChange={(e) => set('alignment', e.target.value)}
          className="w-full max-w-xs border-b-2 border-dashed border-ink-900/30 bg-transparent px-1 py-1.5 text-sm outline-none focus:border-rust-500 dark:border-kraft-100/30"
        >
          <option value="">Unaligned / decide later</option>
          {ALIGNMENTS.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
      </label>

      <Field label="Personality Traits" hint="Two quirks or mannerisms that define how they act…" value={value.personalityTraits} onChange={(v) => set('personalityTraits', v)} />
      <Field label="Ideals" hint="What principle do they refuse to compromise on?" value={value.ideals} onChange={(v) => set('ideals', v)} />
      <Field label="Bonds" hint="A person, place, or thing they're tied to…" value={value.bonds} onChange={(v) => set('bonds', v)} />
      <Field label="Flaws" hint="A weakness or vice that could get them in trouble…" value={value.flaws} onChange={(v) => set('flaws', v)} />
      <Field label="Backstory / Notes" hint="Anything else — history, appearance, plot hooks…" value={value.notes} onChange={(v) => set('notes', v)} />
    </div>
  );
}
