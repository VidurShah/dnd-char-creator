import { useState } from 'react';
import type { Character } from '@/schema/character';
import type { Ability, Decision } from '@/schema/common';
import type { ContentEntry } from '@/schema/content';
import type { LevelUpResult } from './levelUp';
import { addFeat, applyAbilityImprovement, applyClassDecision, setSubclass } from './sheetActions';
import { ABILITY_LABEL, ABILITY_ORDER } from '@/features/characters/builder/builderState';
import { DecisionsStep } from '@/features/characters/builder/steps/DecisionsStep';

interface LevelUpSummaryModalProps {
  character: Character;
  result: LevelUpResult;
  subclassOptions: ContentEntry[];
  feats: ContentEntry[];
  onDone: () => void;
}

type AsiChoice = 'none' | 'improve' | 'feat';

/**
 * Forces the player to actually see (and, for an ASI, resolve) what a level-up
 * just unlocked — new features, an available subclass pick, an available
 * Ability Score Improvement — instead of silently applying the level and
 * leaving them to notice by digging through the Features tab.
 */
export function LevelUpSummaryModal({ character, result, subclassOptions, feats, onDone }: LevelUpSummaryModalProps) {
  const [subclassChosen, setSubclassChosen] = useState(false);
  const [asiChoice, setAsiChoice] = useState<AsiChoice>('none');
  const [asiMode, setAsiMode] = useState<'one' | 'two'>('one');
  const [abilityA, setAbilityA] = useState<Ability>('str');
  const [abilityB, setAbilityB] = useState<Ability>('dex');
  const [featRef, setFeatRef] = useState<string | undefined>(feats[0]?.id);
  const [asiApplied, setAsiApplied] = useState(false);
  const [classDecisionAnswers, setClassDecisionAnswers] = useState<Decision[]>([]);
  const [classDecisionsApplied, setClassDecisionsApplied] = useState(false);

  const asiUnresolved = result.asiAvailable && asiChoice === 'none';
  const classDecisionsUnresolved =
    result.pendingClassDecisions.length > 0 &&
    !classDecisionsApplied &&
    !result.pendingClassDecisions.every((d) => {
      const answer = classDecisionAnswers.find((a) => a.decisionId === d.decisionId);
      return Array.isArray(answer?.choice) && answer.choice.length === d.count;
    });

  async function applyClassDecisions() {
    for (const decision of result.pendingClassDecisions) {
      const answer = classDecisionAnswers.find((a) => a.decisionId === decision.decisionId);
      if (Array.isArray(answer?.choice)) await applyClassDecision(character, result.classRef, result.newLevel, decision.decisionId, answer.choice);
    }
    setClassDecisionsApplied(true);
  }

  async function pickSubclass(subclassRef: string) {
    await setSubclass(character, result.classRef, subclassRef);
    setSubclassChosen(true);
  }

  async function applyAsi() {
    if (asiChoice === 'feat' && featRef) {
      await addFeat(character, featRef);
    } else if (asiChoice === 'improve') {
      const abilities = asiMode === 'one' ? { [abilityA]: 2 } : { [abilityA]: 1, [abilityB]: 1 };
      await applyAbilityImprovement(character, result.classRef, result.newLevel, abilities);
    }
    setAsiApplied(true);
  }

  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-ink-900/40 p-4">
      <div className="max-h-[85vh] w-full max-w-lg overflow-y-auto border-2 border-ink-900 bg-kraft-50 p-5 shadow-lg dark:border-kraft-100 dark:bg-charcoal-800">
        <p className="mb-1 font-display text-lg text-ink-900 dark:text-kraft-100">Level {result.newLevel}!</p>
        <p className="mb-4 text-sm text-ink-700 dark:text-kraft-200">Here's what just unlocked.</p>

        {result.newFeatures.length > 0 && (
          <div className="mb-5">
            <p className="mb-2 font-mono text-xs uppercase tracking-wider text-ink-500 dark:text-kraft-300">New features</p>
            <ul className="flex flex-col gap-3">
              {result.newFeatures.map((f) => (
                <li key={f.ref}>
                  <p className="font-medium">{f.name}</p>
                  <p className="text-sm text-ink-700 dark:text-kraft-200">{f.description}</p>
                </li>
              ))}
            </ul>
          </div>
        )}

        {result.subclassNowAvailable && !subclassChosen && (
          <div className="mb-5">
            <p className="mb-2 font-mono text-xs uppercase tracking-wider text-ink-500 dark:text-kraft-300">Choose a subclass</p>
            {subclassOptions.length === 0 ? (
              <p className="text-sm text-ink-700 dark:text-kraft-200">No subclasses seeded for this class yet.</p>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {subclassOptions.map((s) => (
                  <li key={s.id}>
                    <button
                      type="button"
                      onClick={() => pickSubclass(s.id)}
                      className="w-full border border-ink-900/30 px-2 py-1.5 text-left text-sm hover:border-rust-500 dark:border-kraft-100/30"
                    >
                      <span className="block font-medium">{s.name}</span>
                      {s.kind === 'subclass' && s.data.description && (
                        <span className="block text-xs text-ink-700 dark:text-kraft-200">{s.data.description}</span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <button type="button" onClick={() => setSubclassChosen(true)} className="mt-2 font-mono text-xs italic text-ink-700 dark:text-kraft-200">
              Decide later
            </button>
          </div>
        )}

        {result.asiAvailable && !asiApplied && (
          <div className="mb-5">
            <p className="mb-2 font-mono text-xs uppercase tracking-wider text-ink-500 dark:text-kraft-300">
              Ability Score Improvement or Feat
            </p>
            <div className="mb-2 flex gap-3 text-sm">
              <label className="flex items-center gap-1.5">
                <input type="radio" checked={asiChoice === 'improve'} onChange={() => setAsiChoice('improve')} />
                Improve abilities
              </label>
              <label className="flex items-center gap-1.5">
                <input type="radio" checked={asiChoice === 'feat'} onChange={() => setAsiChoice('feat')} />
                Take a feat
              </label>
            </div>

            {asiChoice === 'improve' && (
              <div className="flex flex-col gap-2 text-sm">
                <div className="flex gap-3">
                  <label className="flex items-center gap-1.5">
                    <input type="radio" checked={asiMode === 'one'} onChange={() => setAsiMode('one')} />
                    +2 one ability
                  </label>
                  <label className="flex items-center gap-1.5">
                    <input type="radio" checked={asiMode === 'two'} onChange={() => setAsiMode('two')} />
                    +1 two abilities
                  </label>
                </div>
                <div className="flex gap-2">
                  <select value={abilityA} onChange={(e) => setAbilityA(e.target.value as Ability)} className="border-b-2 border-dashed border-ink-900/30 bg-transparent py-1 outline-none dark:border-kraft-100/30">
                    {ABILITY_ORDER.map((a) => (
                      <option key={a} value={a}>
                        {ABILITY_LABEL[a]}
                      </option>
                    ))}
                  </select>
                  {asiMode === 'two' && (
                    <select value={abilityB} onChange={(e) => setAbilityB(e.target.value as Ability)} className="border-b-2 border-dashed border-ink-900/30 bg-transparent py-1 outline-none dark:border-kraft-100/30">
                      {ABILITY_ORDER.map((a) => (
                        <option key={a} value={a}>
                          {ABILITY_LABEL[a]}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              </div>
            )}

            {asiChoice === 'feat' && (
              <select
                value={featRef}
                onChange={(e) => setFeatRef(e.target.value)}
                className="w-full border-b-2 border-dashed border-ink-900/30 bg-transparent py-1 text-sm outline-none dark:border-kraft-100/30"
              >
                {feats.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
            )}

            {asiChoice !== 'none' && (
              <button
                type="button"
                onClick={applyAsi}
                className="mt-3 border-2 border-ink-900 bg-ink-900 px-3 py-1.5 font-mono text-xs uppercase tracking-wide text-kraft-50 dark:border-kraft-100 dark:bg-kraft-100 dark:text-ink-900"
              >
                Apply
              </button>
            )}
          </div>
        )}

        {result.pendingClassDecisions.length > 0 && !classDecisionsApplied && (
          <div className="mb-5">
            <p className="mb-2 font-mono text-xs uppercase tracking-wider text-ink-500 dark:text-kraft-300">New choices unlocked</p>
            <DecisionsStep decisions={result.pendingClassDecisions} answers={classDecisionAnswers} onChange={setClassDecisionAnswers} />
            <button
              type="button"
              onClick={applyClassDecisions}
              className="mt-3 border-2 border-ink-900 bg-ink-900 px-3 py-1.5 font-mono text-xs uppercase tracking-wide text-kraft-50 dark:border-kraft-100 dark:bg-kraft-100 dark:text-ink-900"
            >
              Confirm
            </button>
          </div>
        )}

        <div className="mt-4 flex items-center justify-between border-t-2 border-dashed border-ink-900/15 pt-3 dark:border-kraft-100/15">
          {(asiUnresolved || classDecisionsUnresolved) && (
            <span className="text-xs italic text-rust-500">Resolve the choices above, or skip them for now.</span>
          )}
          <span className="flex gap-3">
            {(asiUnresolved || classDecisionsUnresolved) && (
              <button type="button" onClick={onDone} className="font-mono text-xs italic text-ink-700 dark:text-kraft-200">
                Skip for now
              </button>
            )}
            <button
              type="button"
              disabled={asiUnresolved || classDecisionsUnresolved}
              onClick={onDone}
              className="border-2 border-ink-900 bg-ink-900 px-3 py-1.5 font-mono text-xs uppercase tracking-wide text-kraft-50 disabled:opacity-30 dark:border-kraft-100 dark:bg-kraft-100 dark:text-ink-900"
            >
              Done
            </button>
          </span>
        </div>
      </div>
    </div>
  );
}
