import { useState } from 'react';
import type { Character } from '@/schema/character';
import type { DerivedSheet } from '@/engine/compute';
import type { AdvantageMode } from '@/engine/dice';
import { ABILITY_LABEL, ABILITY_ORDER } from '../builder/builderState';
import { humanizeCamel } from '@/lib/text';
import { rollCheck } from './sheetActions';
import { useRollFlash } from './useRollFlash';
import { RollModeToggle } from './RollModeToggle';

function fmtMod(mod: number): string {
  return mod >= 0 ? `+${mod}` : `${mod}`;
}

export function StatsPanel({ character, sheet }: { character: Character; sheet: DerivedSheet }) {
  const { flashes, flash } = useRollFlash();
  // Ability checks and skill checks share a roll mode; saving throws get their own,
  // since 2014 exhaustion can flag one without the other (levels 1-2: checks only).
  const [checkMode, setCheckMode] = useState<AdvantageMode>(sheet.exhaustionDisadvantage.abilityChecks ? 'disadvantage' : 'normal');
  const [saveMode, setSaveMode] = useState<AdvantageMode>(sheet.exhaustionDisadvantage.attacksAndSaves ? 'disadvantage' : 'normal');

  function roll(key: string, label: string, modifier: number, rollMode: AdvantageMode) {
    flash(key, rollCheck(character, label, modifier, rollMode));
  }

  return (
    <div className="flex flex-col gap-6">
      <RollModeToggle
        mode={checkMode}
        onChange={setCheckMode}
        forcedDisadvantageReason={sheet.exhaustionDisadvantage.abilityChecks ? 'Exhaustion imposes disadvantage on ability checks' : undefined}
      />
      <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
        {ABILITY_ORDER.map((ability) => {
          const key = `ability-${ability}`;
          const rolled = flashes[key];
          return (
            <button
              key={ability}
              type="button"
              onClick={() => roll(key, `${ABILITY_LABEL[ability]} check`, sheet.abilities[ability].mod, checkMode)}
              className={`border-2 px-2 py-2 text-center transition-colors ${
                rolled ? 'border-rust-500 bg-rust-500/10' : 'border-ink-900/20 hover:border-rust-500 dark:border-kraft-100/20'
              }`}
            >
              <div className="font-mono text-[10px] uppercase tracking-wider text-ink-500 dark:text-kraft-300">{ability}</div>
              {rolled ? (
                <div className="font-display text-xl text-rust-500">{rolled.total}</div>
              ) : (
                <div className="font-display text-xl">{fmtMod(sheet.abilities[ability].mod)}</div>
              )}
              <div className="font-mono text-[10px] text-ink-700 dark:text-kraft-200">
                {rolled ? `[${rolled.rolls.join(', ')}]` : sheet.abilities[ability].score}
              </div>
            </button>
          );
        })}
      </div>

      <div>
        <p className="mb-1.5 font-mono text-xs uppercase tracking-wider text-ink-500 dark:text-kraft-300">Saving Throws</p>
        <RollModeToggle
          mode={saveMode}
          onChange={setSaveMode}
          forcedDisadvantageReason={sheet.exhaustionDisadvantage.attacksAndSaves ? 'Exhaustion imposes disadvantage on saving throws' : undefined}
        />
        <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-6">
          {ABILITY_ORDER.map((ability) => {
            const save = sheet.savingThrows[ability];
            const key = `save-${ability}`;
            const rolled = flashes[key];
            return (
              <button
                key={ability}
                type="button"
                onClick={() => roll(key, `${ABILITY_LABEL[ability]} save`, save.mod, saveMode)}
                className={`flex items-center justify-between border px-2 py-1 text-xs transition-colors ${
                  rolled ? 'border-rust-500 bg-rust-500/10' : 'border-ink-900/20 hover:border-rust-500 dark:border-kraft-100/20'
                }`}
              >
                <span className="flex items-center gap-1">
                  <span className={`h-1.5 w-1.5 rounded-full ${save.proficient ? 'bg-rust-500' : 'bg-ink-900/20 dark:bg-kraft-100/20'}`} />
                  {ability}
                </span>
                <span className="font-mono">{rolled ? <span className="text-rust-500">{rolled.total}</span> : fmtMod(save.mod)}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <p className="mb-1.5 font-mono text-xs uppercase tracking-wider text-ink-500 dark:text-kraft-300">Skills</p>
        <div className="grid grid-cols-2 gap-1 sm:grid-cols-3">
          {Object.entries(sheet.skills).map(([skill, data]) => {
            const key = `skill-${skill}`;
            const rolled = flashes[key];
            return (
              <button
                key={skill}
                type="button"
                onClick={() => roll(key, humanizeCamel(skill), data.mod, checkMode)}
                className={`flex items-center justify-between px-2 py-1 text-xs transition-colors ${rolled ? 'bg-rust-500/10' : 'hover:bg-ink-900/5 dark:hover:bg-kraft-100/5'}`}
              >
                <span className="flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-rust-500" />
                  {humanizeCamel(skill)}
                </span>
                <span className="font-mono">
                  {rolled ? (
                    <span className="text-rust-500">
                      {rolled.total} <span className="text-[10px]">[{rolled.rolls.join(', ')}]</span>
                    </span>
                  ) : (
                    fmtMod(data.mod)
                  )}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
