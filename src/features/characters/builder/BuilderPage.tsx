import { useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { useContentIndex } from '@/content/useContentIndex';
import { enumerateDecisions } from '@/engine/decisions';
import { computeSheet } from '@/engine/compute';
import { subclassLevelFor } from '@/engine/levelRules';
import { characterRepo } from '@/db/repos';
import type { Edition } from '@/schema/common';
import type { ContentEntry } from '@/schema/content';
import { emptyBuilderState, ABILITY_LABEL, type BuilderState } from './builderState';
import { getClassGuidance } from '@/content/guidance';
import { AbilitiesStep } from './steps/AbilitiesStep';
import { PickOneStep } from './steps/PickOneStep';
import { SubclassStep } from './steps/SubclassStep';
import { FeatsStep } from './steps/FeatsStep';
import { DecisionsStep } from './steps/DecisionsStep';
import { SpellsStep } from './steps/SpellsStep';
import { EquipmentStep } from './steps/EquipmentStep';
import { BackgroundAbilityAllocation } from './steps/BackgroundAbilityAllocation';
import { PersonalityStep } from './steps/PersonalityStep';
import { buildCharacter } from '../characterFactory';
import { humanizeCamel } from '@/lib/text';

const STEPS = [
  'Abilities',
  'Species',
  'Class',
  'Subclass',
  'Background',
  'Feats',
  'Choices',
  'Spells',
  'Equipment',
  'Personality',
  'Review',
] as const;

const EDITIONS: { id: Edition; label: string }[] = [
  { id: '2014', label: "5e (2014 + Tasha's)" },
  { id: '2024', label: '5.5e (2024)' },
];

/** Beginner-facing context for what each step actually means — first-time
 * players building from scratch have nothing else explaining these terms. */
const STEP_HINTS: Record<number, string> = {
  0: "Ability scores are your character's core stats. Higher is better — each pairs with a class that leans on it (Fighters want Strength, Wizards want Intelligence, and so on).",
  1: 'Your species sets size, speed, and often bonus abilities or senses like darkvision. Otherwise it’s a roleplaying choice — pick whatever fits the character you want to play.',
  2: "Your class is the biggest driver of how your character plays — what you're good at, what resources you manage, and whether you cast spells.",
  3: "A specialization within your class. Many subclasses aren't chosen until level 2 or 3 — if there's nothing here yet, or you're not sure, pick “Decide later.”",
  4: 'Your background covers what your character did before adventuring. It grants skill proficiencies and starting equipment (and, in the 2024 rules, an ability score boost and a free feat).',
  5: "Optional extra abilities beyond your class and species. Most characters don't get to pick one until later, via an Ability Score Improvement — feel free to skip this for a first character.",
  6: 'Some classes let you choose which skills you’re trained in. Being "proficient" in a skill adds your proficiency bonus whenever you make a related check.',
  7: 'Cantrips are minor spells you can cast as often as you like. Leveled spells are more powerful but limited by your spell slots, which recharge on a rest.',
  8: "What your character starts play with. Take the class's preset gear, or trade it for a flat amount of gold to buy your own equipment.",
  9: "Purely roleplaying flavor — none of this affects your character's stats. Skip anything that doesn't matter to you yet; you can always fill it in later.",
  10: 'Give your character a name, double-check the summary below, then create them — everything here can still be changed later from the character sheet.',
};

function classShortId(ref: string): string {
  return ref.split('/').pop() ?? ref;
}

interface BuilderLocationState {
  prefill?: BuilderState;
  warnings?: string[];
}

export function BuilderPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const locationState = location.state as BuilderLocationState | null;
  const [step, setStep] = useState(0);
  const [state, setState] = useState(locationState?.prefill ?? emptyBuilderState());
  const { entries, byId, loading } = useContentIndex(state.edition);

  function changeEdition(edition: Edition) {
    setState({ ...emptyBuilderState(), edition, name: state.name });
  }

  const species = useMemo(() => entries.filter((e) => e.kind === 'species'), [entries]);
  const classes = useMemo(() => entries.filter((e) => e.kind === 'class'), [entries]);
  const subclasses = useMemo(
    () => entries.filter((e) => e.kind === 'subclass' && e.data.parentClassRef === state.classRef),
    [entries, state.classRef],
  );
  const backgrounds = useMemo(() => entries.filter((e) => e.kind === 'background'), [entries]);
  const feats = useMemo(() => entries.filter((e) => e.kind === 'feat'), [entries]);
  const items = useMemo(() => entries.filter((e) => e.kind === 'item'), [entries]);

  const draft = useMemo(() => buildCharacter(state, items, byId), [state, items, byId]);
  const sheet = useMemo(() => computeSheet(draft, byId), [draft, byId]);
  const allDecisions = useMemo(() => enumerateDecisions(draft, byId), [draft, byId]);
  // Species choices are surfaced on the species step itself rather than deferred
  // to the generic Decisions step, so a cascading choice is made where it arises.
  const speciesDecisions = useMemo(() => allDecisions.filter((d) => d.scope === 'species'), [allDecisions]);
  const decisions = useMemo(
    () => (state.classRef ? allDecisions.filter((d) => d.scope !== 'species') : []),
    [state.classRef, allDecisions],
  );

  const isAnswered = (d: (typeof allDecisions)[number], answers: typeof state.classDecisions) => {
    const answer = answers.find((a) => a.decisionId === d.decisionId);
    return Array.isArray(answer?.choice) && answer.choice.length === d.count;
  };
  const decisionsComplete = decisions.every((d) => isAnswered(d, state.classDecisions));
  const speciesDecisionsComplete = speciesDecisions.every((d) => isAnswered(d, state.speciesDecisions));

  const speciesEntry = state.speciesRef ? byId.get(state.speciesRef) : undefined;
  const subclassUnlockLevel = useMemo(
    () => subclassLevelFor(subclasses.filter((s): s is Extract<ContentEntry, { kind: 'subclass' }> => s.kind === 'subclass')),
    [subclasses],
  );
  const selectedSubclass = state.subclassRef ? byId.get(state.subclassRef) : undefined;

  const classEntry = state.classRef ? byId.get(state.classRef) : undefined;
  const classShort = state.classRef ? classShortId(state.classRef) : undefined;
  const spellMeta = classEntry?.kind === 'class' ? classEntry.data.spellcasting : undefined;

  const backgroundEntry = state.backgroundRef ? byId.get(state.backgroundRef) : undefined;
  const abilityScoreOptions = backgroundEntry?.kind === 'background' ? backgroundEntry.data.abilityScoreOptions : undefined;
  const allocationTotal = Object.values(state.backgroundAbilityAllocation).reduce((sum, v) => sum + (v ?? 0), 0);

  const spellPool = useMemo(
    () =>
      classShort
        ? entries.filter((e) => e.kind === 'spell' && e.data.classLists.includes(classShort) && e.data.level <= 1)
        : [],
    [entries, classShort],
  );
  const cantrips = spellPool.filter((e) => e.kind === 'spell' && e.data.level === 0);
  const leveledSpells = spellPool.filter((e) => e.kind === 'spell' && e.data.level === 1);
  const cantripCap = sheet.spellcasting?.cantripsKnown ?? 0;
  const leveledCap = (() => {
    if (!spellMeta || classEntry?.kind !== 'class') return 0;
    const level1 = classEntry.data.levels.find((l) => l.level === 1);
    if (spellMeta.knownOrPrepared === 'known') {
      const known = level1?.columns?.spells_known;
      return typeof known === 'number' ? known : 0;
    }
    return Math.max(1, sheet.abilities[spellMeta.ability].mod + 1);
  })();

  const canAdvance: Record<number, boolean> = {
    0: true,
    1: state.speciesRef != null && speciesDecisionsComplete,
    // A class whose subclass unlocks at level 1 (2014 Cleric/Sorcerer/Warlock)
    // must have one chosen before moving on — otherwise the character ships
    // missing a feature it is entitled to at creation.
    2: state.classRef != null && (subclassUnlockLevel > 1 || state.subclassRef != null),
    3: true,
    4: state.backgroundRef != null && (!abilityScoreOptions || allocationTotal === 3),
    5: true,
    6: decisionsComplete,
    7: true,
    8: true,
    9: true,
    10: true,
  };

  function createCharacter() {
    const character = buildCharacter(state, items, byId);
    const finalSheet = computeSheet(character, byId);
    character.state.hp.current = finalSheet.hp.max;
    characterRepo.save(character).then(() => navigate(`/characters/${character.id}`));
  }

  if (loading) return <p className="text-sm text-ink-700 dark:text-kraft-200">Loading…</p>;

  return (
    <div>
      {locationState?.prefill && (
        <div className="mb-4 border-2 border-rust-500 bg-rust-500/10 px-4 py-3">
          <p className="text-sm font-medium text-ink-900 dark:text-kraft-100">AI-suggested build — review every step before creating.</p>
          <p className="text-sm text-ink-700 dark:text-kraft-200">Nothing here is final; change anything that doesn't fit before you create the character.</p>
          {locationState.warnings && locationState.warnings.length > 0 && (
            <ul className="mt-2 list-inside list-disc text-xs text-ink-700 dark:text-kraft-200">
              {locationState.warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          )}
        </div>
      )}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-xl text-ink-900 dark:text-kraft-100">Build a Character</h1>
        <div className="flex gap-1 border-2 border-ink-900/20 p-1 dark:border-kraft-100/20">
          {EDITIONS.map((e) => (
            <button
              key={e.id}
              type="button"
              onClick={() => changeEdition(e.id)}
              className={`px-3 py-1.5 font-mono text-xs uppercase tracking-wide ${
                state.edition === e.id
                  ? 'bg-ink-900 text-kraft-50 dark:bg-kraft-100 dark:text-ink-900'
                  : 'text-ink-700 dark:text-kraft-200'
              }`}
            >
              {e.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mb-5 flex flex-wrap gap-2">
        {STEPS.map((label, i) => (
          <button
            key={label}
            type="button"
            onClick={() => i <= step && setStep(i)}
            disabled={i > step}
            className={`border-2 px-2.5 py-1 font-mono text-[11px] uppercase tracking-wide ${
              i === step
                ? 'border-ink-900 bg-ink-900 text-kraft-50 dark:border-kraft-100 dark:bg-kraft-100 dark:text-ink-900'
                : i < step
                  ? 'border-ink-900/40 text-ink-700 dark:border-kraft-100/40 dark:text-kraft-200'
                  : 'cursor-not-allowed border-ink-900/15 text-ink-900/30 dark:border-kraft-100/15 dark:text-kraft-100/30'
            }`}
          >
            {i + 1}. {label}
          </button>
        ))}
      </div>

      <hr className="rule-sketch mb-5" />

      {STEP_HINTS[step] && <p className="text-sm italic text-ink-700 dark:text-kraft-200">{STEP_HINTS[step]}</p>}
      {step === 2 && classEntry && getClassGuidance(state.edition, classEntry.id) && (
        <p className="text-sm text-ink-700 dark:text-kraft-200">
          <span className="font-medium text-ink-900 dark:text-kraft-100">Why these abilities: </span>
          {getClassGuidance(state.edition, classEntry.id)!.abilityRationale}
        </p>
      )}
      <div className="mb-5" />

      <div className="min-h-[16rem]">
        {step === 0 && (
          <AbilitiesStep value={state.baseAbilities} onChange={(baseAbilities) => setState((s) => ({ ...s, baseAbilities }))} />
        )}
        {step === 1 && (
          <div className="flex flex-col gap-6">
            <PickOneStep
              entries={species}
              value={state.speciesRef}
              // Changing species invalidates any lineage/variant answers tied to the old one.
              onChange={(speciesRef) => setState((s) => ({ ...s, speciesRef, speciesDecisions: [] }))}
              describe={(e) => (e.kind === 'species' ? `Speed ${e.data.speed} ft · ${e.data.size}` : '')}
              parentRefOf={(e) => (e.kind === 'species' ? e.data.parentSpeciesRef : undefined)}
              baseOptionLabel={() => 'Standard'}
            />
            {speciesDecisions.length > 0 && (
              <div className="border-2 border-dashed border-ink-900/25 p-4 dark:border-kraft-100/25">
                <h3 className="mb-3 font-mono text-[11px] font-semibold uppercase tracking-wider text-olive-500">
                  {speciesEntry?.name} — choices
                </h3>
                <DecisionsStep
                  decisions={speciesDecisions}
                  answers={state.speciesDecisions}
                  onChange={(speciesDecisions) => setState((s) => ({ ...s, speciesDecisions }))}
                />
              </div>
            )}
          </div>
        )}
        {step === 2 && (
          <PickOneStep
            entries={classes}
            value={state.classRef}
            onChange={(classRef) =>
              setState((s) => ({
                ...s,
                classRef,
                subclassRef: undefined,
                classDecisions: [],
                knownSpells: [],
                equipmentChoicePicks: [],
                takeStartingGold: false,
              }))
            }
            describe={(e) => {
              if (e.kind !== 'class') return '';
              const base = `Hit die ${e.data.hitDie}${e.data.spellcasting ? ' · Spellcaster' : ''}`;
              const guidance = getClassGuidance(state.edition, e.id);
              if (!guidance) return base;
              const abilities = guidance.recommendedAbilities.map((a) => ABILITY_LABEL[a]).join(', ');
              return `${base} · Recommended: ${abilities}`;
            }}
          />
        )}
        {step === 2 && state.classRef && (
          <div className="mt-6 border-2 border-dashed border-ink-900/25 p-4 dark:border-kraft-100/25">
            <h3 className="mb-2 font-mono text-[11px] font-semibold uppercase tracking-wider text-olive-500">
              {classEntry?.name} — subclass
            </h3>
            {subclassUnlockLevel > 1 ? (
              // Don't offer a choice the character can't legally make yet, but
              // don't leave it silently blank either — say when it unlocks.
              <p className="text-sm text-ink-700 dark:text-kraft-200">
                Chosen at level {subclassUnlockLevel}. You'll pick it when you level up.
              </p>
            ) : (
              <>
                <select
                  aria-label="Subclass"
                  value={state.subclassRef ?? ''}
                  onChange={(e) => setState((s) => ({ ...s, subclassRef: e.target.value || undefined }))}
                  className="w-full border-2 border-ink-900/30 bg-transparent px-2 py-1.5 text-sm dark:border-kraft-100/30"
                >
                  <option value="">Choose a subclass…</option>
                  {subclasses.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
                {selectedSubclass?.kind === 'subclass' && selectedSubclass.data.description && (
                  <p className="mt-3 text-sm leading-relaxed text-ink-700 dark:text-kraft-200">
                    {selectedSubclass.data.description}
                  </p>
                )}
              </>
            )}
          </div>
        )}
        {step === 3 && (
          <SubclassStep
            subclasses={subclasses}
            value={state.subclassRef}
            onChange={(subclassRef) => setState((s) => ({ ...s, subclassRef }))}
            guidance={state.classRef ? getClassGuidance(state.edition, state.classRef) : undefined}
          />
        )}
        {step === 4 && (
          <div>
            <PickOneStep
              entries={backgrounds}
              value={state.backgroundRef}
              onChange={(backgroundRef) => setState((s) => ({ ...s, backgroundRef, backgroundAbilityAllocation: {} }))}
              describe={(e) => (e.kind === 'background' ? e.data.skillProficiencies.map(humanizeCamel).join(', ') : '')}
            />
            {abilityScoreOptions && (
              <BackgroundAbilityAllocation
                options={abilityScoreOptions}
                value={state.backgroundAbilityAllocation}
                onChange={(backgroundAbilityAllocation) => setState((s) => ({ ...s, backgroundAbilityAllocation }))}
              />
            )}
          </div>
        )}
        {step === 5 && <FeatsStep feats={feats} value={state.featRefs} onChange={(featRefs) => setState((s) => ({ ...s, featRefs }))} />}
        {step === 6 && (
          <DecisionsStep
            decisions={decisions}
            answers={state.classDecisions}
            onChange={(classDecisions) => setState((s) => ({ ...s, classDecisions }))}
          />
        )}
        {step === 7 &&
          (spellMeta ? (
            <SpellsStep
              cantrips={cantrips}
              leveledSpells={leveledSpells}
              cantripCap={cantripCap}
              leveledCap={leveledCap}
              value={state.knownSpells}
              onChange={(knownSpells) => setState((s) => ({ ...s, knownSpells }))}
            />
          ) : (
            <p className="text-sm text-ink-700 dark:text-kraft-200">Not a spellcaster — nothing to pick here.</p>
          ))}
        {step === 8 && (
          <EquipmentStep
            items={items}
            backgroundEntry={backgroundEntry}
            classEntry={classEntry}
            inventory={state.inventory}
            onChange={(inventory) => setState((s) => ({ ...s, inventory }))}
            equipmentChoicePicks={state.equipmentChoicePicks}
            onChoicePick={(choiceIndex, optionIndex) =>
              setState((s) => {
                const picks = [...s.equipmentChoicePicks];
                picks[choiceIndex] = optionIndex;
                return { ...s, equipmentChoicePicks: picks };
              })
            }
            takeStartingGold={state.takeStartingGold}
            onToggleStartingGold={(takeStartingGold) =>
              setState((s) => ({
                ...s,
                takeStartingGold,
                currency: takeStartingGold && classEntry?.kind === 'class' && classEntry.data.startingEquipment
                  ? { ...s.currency, gp: classEntry.data.startingEquipment.goldAlternative }
                  : s.currency,
              }))
            }
            currency={state.currency}
            onCurrencyChange={(currency) => setState((s) => ({ ...s, currency }))}
          />
        )}
        {step === 9 && (
          <PersonalityStep
            value={{
              alignment: state.alignment,
              personalityTraits: state.personalityTraits,
              ideals: state.ideals,
              bonds: state.bonds,
              flaws: state.flaws,
              notes: state.notes,
            }}
            onChange={(value) => setState((s) => ({ ...s, ...value }))}
          />
        )}
        {step === 10 && (
          <div>
            <label className="mb-4 flex flex-col gap-1">
              <span className="font-mono text-xs uppercase tracking-wider text-ink-500 dark:text-kraft-300">Name</span>
              <input
                type="text"
                value={state.name}
                onChange={(e) => setState((s) => ({ ...s, name: e.target.value }))}
                placeholder="What do they call you?"
                className="border-b-2 border-dashed border-ink-900/30 bg-transparent px-1 py-2 text-lg outline-none focus:border-rust-500 dark:border-kraft-100/30"
              />
            </label>
            <p className="text-sm text-ink-700 dark:text-kraft-200">
              {species.find((e) => e.id === state.speciesRef)?.name} {classes.find((e) => e.id === state.classRef)?.name}
              {state.subclassRef ? ` (${subclasses.find((e) => e.id === state.subclassRef)?.name})` : ''}, level 1
            </p>
            <button
              type="button"
              onClick={createCharacter}
              className="mt-6 border-2 border-ink-900 bg-ink-900 px-4 py-2 font-mono text-xs uppercase tracking-wide text-kraft-50 dark:border-kraft-100 dark:bg-kraft-100 dark:text-ink-900"
            >
              Create Character
            </button>
          </div>
        )}
      </div>

      <div className="mt-8 flex justify-between border-t-2 border-dashed border-ink-900/15 pt-4 dark:border-kraft-100/15">
        <button
          type="button"
          disabled={step === 0}
          onClick={() => setStep((s) => s - 1)}
          className="font-mono text-xs uppercase tracking-wide text-ink-700 disabled:opacity-30 dark:text-kraft-200"
        >
          ← Back
        </button>
        {step < STEPS.length - 1 && (
          <button
            type="button"
            disabled={!canAdvance[step]}
            onClick={() => setStep((s) => s + 1)}
            className="font-mono text-xs uppercase tracking-wide text-ink-700 disabled:opacity-30 dark:text-kraft-200"
          >
            Next →
          </button>
        )}
      </div>
    </div>
  );
}
