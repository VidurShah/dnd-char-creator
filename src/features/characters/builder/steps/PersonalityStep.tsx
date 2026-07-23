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

/** The PHB standard + exotic language list, offered as quick toggles. Anything
 * else (regional or homebrew) can still be typed into the free-text box. */
const STANDARD_LANGUAGES = [
  'Common',
  'Dwarvish',
  'Elvish',
  'Giant',
  'Gnomish',
  'Goblin',
  'Halfling',
  'Orc',
  'Abyssal',
  'Celestial',
  'Draconic',
  'Deep Speech',
  'Infernal',
  'Primordial',
  'Sylvan',
  'Undercommon',
];

export interface PersonalityDraft {
  alignment: string;
  languages: string;
  personalityTraits: string;
  ideals: string;
  bonds: string;
  flaws: string;
  notes: string;
}

/** Languages are stored as a comma-joined string (CharacterState.languages) since
 * they aren't modeled as content; these helpers keep the chip UI in sync with it. */
function parseLanguages(value: string): string[] {
  return value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}
function joinLanguages(list: string[]): string {
  return [...new Set(list)].join(', ');
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

  const chosenLanguages = parseLanguages(value.languages);
  const customLanguages = chosenLanguages.filter((l) => !STANDARD_LANGUAGES.includes(l));
  function toggleLanguage(lang: string) {
    const has = chosenLanguages.includes(lang);
    set('languages', joinLanguages(has ? chosenLanguages.filter((l) => l !== lang) : [...chosenLanguages, lang]));
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

      <div className="flex flex-col gap-2">
        <span className="font-mono text-xs uppercase tracking-wider text-ink-500 dark:text-kraft-300">Languages</span>
        <p className="text-xs text-ink-700 dark:text-kraft-200">
          Your species and background grant a few languages — tap the ones your character knows. Common is a safe default for most.
        </p>
        <div className="flex flex-wrap gap-1.5">
          {STANDARD_LANGUAGES.map((lang) => {
            const active = chosenLanguages.includes(lang);
            return (
              <button
                key={lang}
                type="button"
                onClick={() => toggleLanguage(lang)}
                className={`rounded-sm border px-2 py-1 text-xs transition-colors ${
                  active
                    ? 'border-ink-900 bg-ink-900 text-kraft-50 dark:border-kraft-100 dark:bg-kraft-100 dark:text-ink-900'
                    : 'border-ink-900/25 text-ink-700 hover:border-ink-900/50 dark:border-kraft-100/25 dark:text-kraft-200'
                }`}
              >
                {lang}
              </button>
            );
          })}
        </div>
        <input
          type="text"
          value={customLanguages.join(', ')}
          onChange={(e) => set('languages', joinLanguages([...chosenLanguages.filter((l) => STANDARD_LANGUAGES.includes(l)), ...parseLanguages(e.target.value)]))}
          placeholder="Other languages (e.g. Thieves' Cant, Druidic)…"
          className="w-full border-b-2 border-dashed border-ink-900/30 bg-transparent px-1 py-1.5 text-sm outline-none focus:border-rust-500 dark:border-kraft-100/30"
        />
      </div>

      <Field label="Personality Traits" hint="Two quirks or mannerisms that define how they act…" value={value.personalityTraits} onChange={(v) => set('personalityTraits', v)} />
      <Field label="Ideals" hint="What principle do they refuse to compromise on?" value={value.ideals} onChange={(v) => set('ideals', v)} />
      <Field label="Bonds" hint="A person, place, or thing they're tied to…" value={value.bonds} onChange={(v) => set('bonds', v)} />
      <Field label="Flaws" hint="A weakness or vice that could get them in trouble…" value={value.flaws} onChange={(v) => set('flaws', v)} />
      <Field label="Backstory / Notes" hint="Anything else — history, appearance, plot hooks…" value={value.notes} onChange={(v) => set('notes', v)} />
    </div>
  );
}
