import { useMemo, useState } from 'react';
import type { Character } from '@/schema/character';
import type { ContentEntry } from '@/schema/content';
import { levelUpClass, type LevelUpResult } from './levelUp';
import { LevelUpSummaryModal } from './LevelUpSummaryModal';

interface LevelUpPanelProps {
  character: Character;
  index: Map<string, ContentEntry>;
  classes: ContentEntry[];
  subclasses: ContentEntry[];
  feats: ContentEntry[];
  onClose: () => void;
}

export function LevelUpPanel({ character, index, classes, subclasses, feats, onClose }: LevelUpPanelProps) {
  const takenRefs = new Set(character.build.classes.map((c) => c.classRef));
  const untakenClasses = classes.filter((c) => !takenRefs.has(c.id));
  const [newClassRef, setNewClassRef] = useState<string | undefined>(untakenClasses[0]?.id);
  const [newSubclassRef, setNewSubclassRef] = useState<string | undefined>(undefined);
  const [result, setResult] = useState<LevelUpResult | undefined>(undefined);

  const subclassOptionsForNewClass = useMemo(
    () => subclasses.filter((s) => s.kind === 'subclass' && s.data.parentClassRef === newClassRef),
    [subclasses, newClassRef],
  );

  const subclassOptionsForResult = useMemo(
    () => (result ? subclasses.filter((s) => s.kind === 'subclass' && s.data.parentClassRef === result.classRef) : []),
    [subclasses, result],
  );

  async function level(classRef: string, useAverage: boolean, subclassRef?: string) {
    const levelUpResult = await levelUpClass(character, index, classRef, useAverage, subclassRef);
    if (
      levelUpResult.newFeatures.length > 0 ||
      levelUpResult.subclassNowAvailable ||
      levelUpResult.asiAvailable ||
      levelUpResult.pendingClassDecisions.length > 0
    ) {
      setResult(levelUpResult);
    } else {
      onClose();
    }
  }

  if (result) {
    return (
      <LevelUpSummaryModal
        character={character}
        result={result}
        subclassOptions={subclassOptionsForResult}
        feats={feats}
        onDone={onClose}
      />
    );
  }

  return (
    <div className="absolute z-10 mt-2 w-96 border-2 border-ink-900 bg-kraft-50 p-4 shadow-lg dark:border-kraft-100 dark:bg-charcoal-800">
      <div className="mb-3 flex items-center justify-between">
        <p className="font-mono text-xs uppercase tracking-wider text-ink-500 dark:text-kraft-300">Level Up</p>
        <button type="button" onClick={onClose} className="font-mono text-xs text-ink-700 dark:text-kraft-200">
          ✕
        </button>
      </div>

      {character.build.classes.length > 0 && (
        <div className="mb-4">
          <p className="mb-1.5 text-xs text-ink-700 dark:text-kraft-200">Level up an existing class</p>
          <ul className="flex flex-col gap-1.5">
            {character.build.classes.map((c) => {
              const entry = index.get(c.classRef);
              return (
                <li key={c.classRef} className="flex items-center justify-between text-sm">
                  <span>
                    {entry?.name} {c.levels}
                  </span>
                  <span className="flex gap-1.5">
                    <button
                      type="button"
                      onClick={() => level(c.classRef, true)}
                      className="border border-ink-900/30 px-2 py-0.5 font-mono text-[11px] uppercase dark:border-kraft-100/30"
                    >
                      +1 (avg)
                    </button>
                    <button
                      type="button"
                      onClick={() => level(c.classRef, false)}
                      className="border border-ink-900/30 px-2 py-0.5 font-mono text-[11px] uppercase dark:border-kraft-100/30"
                    >
                      +1 (roll)
                    </button>
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {untakenClasses.length > 0 && (
        <div>
          <p className="mb-1.5 text-xs text-ink-700 dark:text-kraft-200">Multiclass into a new class</p>
          <select
            value={newClassRef}
            onChange={(e) => {
              setNewClassRef(e.target.value);
              setNewSubclassRef(undefined);
            }}
            className="mb-2 w-full border-b-2 border-dashed border-ink-900/30 bg-transparent py-1 text-sm outline-none dark:border-kraft-100/30"
          >
            {untakenClasses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>

          {subclassOptionsForNewClass.length > 0 && (
            <select
              value={newSubclassRef ?? ''}
              onChange={(e) => setNewSubclassRef(e.target.value || undefined)}
              className="mb-2 w-full border-b-2 border-dashed border-ink-900/30 bg-transparent py-1 text-sm outline-none dark:border-kraft-100/30"
            >
              <option value="">Decide subclass later</option>
              {subclassOptionsForNewClass.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          )}

          <div className="flex gap-1.5">
            <button
              type="button"
              disabled={!newClassRef}
              onClick={() => newClassRef && level(newClassRef, true, newSubclassRef)}
              className="border border-ink-900/30 px-2 py-1 font-mono text-[11px] uppercase dark:border-kraft-100/30"
            >
              Add at Lvl 1 (avg)
            </button>
            <button
              type="button"
              disabled={!newClassRef}
              onClick={() => newClassRef && level(newClassRef, false, newSubclassRef)}
              className="border border-ink-900/30 px-2 py-1 font-mono text-[11px] uppercase dark:border-kraft-100/30"
            >
              Add at Lvl 1 (roll)
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
