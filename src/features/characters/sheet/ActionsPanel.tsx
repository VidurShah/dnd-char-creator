import { useState } from 'react';
import type { Character } from '@/schema/character';
import type { ContentEntry } from '@/schema/content';
import type { DerivedSheet } from '@/engine/compute';
import type { AdvantageMode } from '@/engine/dice';
import { humanizeCamel } from '@/lib/text';
import { CONDITIONS } from './conditions';
import {
  addKnownSpell,
  adjustResourceSpent,
  longRest,
  removeKnownSpell,
  rollCheck,
  rollDamage,
  setDeathSave,
  setExhaustion,
  shortRest,
  toggleCondition,
  togglePactSlotSpent,
  toggleRaging,
  toggleSlotSpent,
} from './sheetActions';
import { useRollFlash } from './useRollFlash';
import { RollModeToggle } from './RollModeToggle';
import { WEAPON_MASTERY_DESCRIPTIONS } from '@/engine/editions/2024';

function fmtMod(mod: number): string {
  return mod >= 0 ? `+${mod}` : `${mod}`;
}

export function ActionsPanel({ character, sheet, index }: { character: Character; sheet: DerivedSheet; index: Map<string, ContentEntry> }) {
  const { flashes, flash } = useRollFlash();
  const [attackMode, setAttackMode] = useState<AdvantageMode>(sheet.exhaustionDisadvantage.attacksAndSaves ? 'disadvantage' : 'normal');
  const isDown = character.state.hp.current <= 0;
  const canRage = sheet.resources.some((r) => r.id.endsWith('/rage_count'));
  const sneakAttackRoll = flashes['sneak-attack'];

  return (
    <div className="flex flex-col gap-6">
      {canRage && (
        <div>
          <p className="mb-1.5 font-mono text-xs uppercase tracking-wider text-ink-500 dark:text-kraft-300">Rage</p>
          <button
            type="button"
            onClick={() => toggleRaging(character)}
            className={`border-2 px-3 py-1.5 font-mono text-xs uppercase tracking-wide transition-colors ${
              character.state.raging
                ? 'border-rust-500 bg-rust-500 text-kraft-50'
                : 'border-ink-900/30 hover:border-rust-500 dark:border-kraft-100/30'
            }`}
          >
            {character.state.raging ? 'Raging — click to end' : 'Start Raging'}
          </button>
          <p className="mt-1 text-xs text-ink-700 dark:text-kraft-200">
            While raging, Strength-based melee attacks and damage get a bonus, you have resistance to bludgeoning/piercing/slashing damage, and
            you can't cast spells.
          </p>
        </div>
      )}

      {sheet.attacks.length > 0 && (
        <div>
          <p className="mb-1.5 font-mono text-xs uppercase tracking-wider text-ink-500 dark:text-kraft-300">Attacks</p>
          <RollModeToggle
            mode={attackMode}
            onChange={setAttackMode}
            forcedDisadvantageReason={sheet.exhaustionDisadvantage.attacksAndSaves ? 'Exhaustion imposes disadvantage on attack rolls' : undefined}
          />
          <ul className="flex flex-col gap-1.5">
            {sheet.attacks.map((atk) => {
              const attackKey = `attack-${atk.itemRef}`;
              const damageKey = `damage-${atk.itemRef}`;
              const attackRoll = flashes[attackKey];
              const damageRoll = flashes[damageKey];
              const masteryDescription = atk.mastery ? WEAPON_MASTERY_DESCRIPTIONS[atk.mastery] : undefined;
              return (
                <li key={atk.itemRef} className="border border-ink-900/20 px-3 py-2 dark:border-kraft-100/20">
                <div className="flex items-center justify-between">
                  <span className="font-medium">{atk.name}</span>
                  <span className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => flash(attackKey, rollCheck(character, `${atk.name} attack`, atk.attackBonus, attackMode))}
                      className={`border px-2 py-1 font-mono text-xs transition-colors ${
                        attackRoll ? 'border-rust-500 bg-rust-500/10' : 'border-ink-900/30 hover:border-rust-500 dark:border-kraft-100/30'
                      }`}
                    >
                      {attackRoll ? (
                        <>
                          Attack <span className="text-rust-500">{attackRoll.total}</span>{' '}
                          <span className="text-[10px]">[{attackRoll.rolls.join(', ')}]</span>
                        </>
                      ) : (
                        <>Attack {fmtMod(atk.attackBonus)}</>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => flash(damageKey, rollDamage(character, `${atk.name} damage`, atk.damageDice, atk.damageBonus))}
                      className={`border px-2 py-1 font-mono text-xs transition-colors ${
                        damageRoll ? 'border-rust-500 bg-rust-500/10' : 'border-ink-900/30 hover:border-rust-500 dark:border-kraft-100/30'
                      }`}
                    >
                      {damageRoll ? (
                        <>
                          Damage <span className="text-rust-500">{damageRoll.total}</span>{' '}
                          <span className="text-[10px]">[{damageRoll.rolls.join(', ')}]</span>
                        </>
                      ) : (
                        <>
                          Damage {atk.damageDice}
                          {fmtMod(atk.damageBonus)}
                        </>
                      )}
                    </button>
                  </span>
                </div>
                {atk.mastery && (
                  <p className="mt-1 text-xs text-ink-700 dark:text-kraft-200">
                    <span className="font-medium">{atk.mastery}</span>
                    {masteryDescription ? ` — ${masteryDescription}` : ''}
                  </p>
                )}
                </li>
              );
            })}
          </ul>
          {sheet.sneakAttackDice && (
            <div className="mt-2 flex items-center gap-2">
              <button
                type="button"
                onClick={() => flash('sneak-attack', rollDamage(character, 'Sneak Attack', sheet.sneakAttackDice!, 0))}
                className={`border px-2 py-1 font-mono text-xs transition-colors ${
                  sneakAttackRoll ? 'border-rust-500 bg-rust-500/10' : 'border-ink-900/30 hover:border-rust-500 dark:border-kraft-100/30'
                }`}
              >
                {sneakAttackRoll ? (
                  <>
                    Sneak Attack <span className="text-rust-500">{sneakAttackRoll.total}</span>{' '}
                    <span className="text-[10px]">[{sneakAttackRoll.rolls.join(', ')}]</span>
                  </>
                ) : (
                  <>Sneak Attack {sheet.sneakAttackDice}</>
                )}
              </button>
              <p className="text-xs text-ink-700 dark:text-kraft-200">
                Once per turn, when you hit with a finesse or ranged weapon and have advantage (or an ally is adjacent to the target).
              </p>
            </div>
          )}
        </div>
      )}

      {sheet.spellcasting && (
        <div>
          <p className="mb-1.5 font-mono text-xs uppercase tracking-wider text-ink-500 dark:text-kraft-300">Spellcasting</p>
          <p className="mb-2 text-xs text-ink-700 dark:text-kraft-200">
            Casting a leveled spell spends one slot of that level or higher — click a filled dot below to expend it (click again to refund).
            Slots come back on a long rest (Pact slots on a short rest). Cantrips are free and never use a slot.
          </p>
          <div className="mb-2 flex gap-4 text-sm">
            <span>
              Save DC <span className="font-mono">{sheet.spellcasting.saveDc}</span>
            </span>
            <span>
              Attack <span className="font-mono">{fmtMod(sheet.spellcasting.attackBonus)}</span>
            </span>
            <span>
              Cantrips known <span className="font-mono">{sheet.spellcasting.cantripsKnown}</span>
            </span>
          </div>
          <div className="flex flex-col gap-1">
            {sheet.spellcasting.slots.slice(1).map((max, i) => {
              const level = i + 1;
              if (max === 0) return null;
              const spent = character.state.spellSlotsSpent[level] ?? 0;
              return (
                <div key={level} className="flex items-center gap-2 text-sm">
                  <span className="w-16 font-mono text-xs uppercase tracking-wide text-ink-500 dark:text-kraft-300">Level {level}</span>
                  <span className="flex gap-1">
                    {Array.from({ length: max }, (_, slotIndex) => (
                      <button
                        key={slotIndex}
                        type="button"
                        onClick={() => toggleSlotSpent(character, level, slotIndex)}
                        className={`h-4 w-4 rounded-full border-2 ${
                          slotIndex < spent ? 'border-ink-900/40 bg-transparent dark:border-kraft-100/40' : 'border-rust-500 bg-rust-500'
                        }`}
                        aria-label={`Slot ${slotIndex + 1}`}
                      />
                    ))}
                  </span>
                </div>
              );
            })}
            {sheet.spellcasting.pactSlots && (
              <div className="flex items-center gap-2 text-sm">
                <span className="w-16 font-mono text-xs uppercase tracking-wide text-ink-500 dark:text-kraft-300">
                  Pact {sheet.spellcasting.pactSlots.level}
                </span>
                <span className="flex gap-1">
                  {Array.from({ length: sheet.spellcasting.pactSlots.count }, (_, slotIndex) => (
                    <button
                      key={slotIndex}
                      type="button"
                      onClick={() => togglePactSlotSpent(character, slotIndex)}
                      className={`h-4 w-4 rounded-full border-2 ${
                        slotIndex < character.state.pactSlotsSpent
                          ? 'border-ink-900/40 bg-transparent dark:border-kraft-100/40'
                          : 'border-olive-500 bg-olive-500'
                      }`}
                      aria-label={`Pact slot ${slotIndex + 1}`}
                    />
                  ))}
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      <SpellList character={character} index={index} grantedSpellRefs={sheet.grantedSpellRefs} spellcasting={sheet.spellcasting} />

      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <p className="font-mono text-xs uppercase tracking-wider text-ink-500 dark:text-kraft-300">Rest</p>
          <span className="flex gap-2">
            <button
              type="button"
              onClick={() => shortRest(character, sheet)}
              className="border border-ink-900/30 px-2 py-1 font-mono text-xs uppercase tracking-wide hover:border-rust-500 dark:border-kraft-100/30"
            >
              Short Rest
            </button>
            <button
              type="button"
              onClick={() => longRest(character, sheet)}
              className="border border-ink-900/30 px-2 py-1 font-mono text-xs uppercase tracking-wide hover:border-rust-500 dark:border-kraft-100/30"
            >
              Long Rest
            </button>
          </span>
        </div>
        <p className="text-xs text-ink-700 dark:text-kraft-200">
          A short rest recovers short-recharge resources (like Pact Magic). A long rest fully heals HP, restores every resource and spell slot,
          and reduces exhaustion by one level.
        </p>
      </div>

      {sheet.resources.length > 0 && (
        <div>
          <p className="mb-1.5 font-mono text-xs uppercase tracking-wider text-ink-500 dark:text-kraft-300">Resources</p>
          <div className="flex flex-col gap-1.5">
            {sheet.resources.map((r) => {
              const spent = character.state.resourcesSpent[r.id] ?? 0;
              return (
                <div key={r.id} className="flex items-start justify-between gap-3 text-sm">
                  <span>
                    <span className="block">
                      {r.label} <span className="text-xs text-ink-500 dark:text-kraft-300">({r.recharge === 'none' ? 'not renewable' : `${r.recharge} rest`})</span>
                    </span>
                    <span className="block text-xs text-ink-700 dark:text-kraft-200">{r.description}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    <button
                      type="button"
                      onClick={() => adjustResourceSpent(character, r.id, -1, r.max)}
                      className="h-5 w-5 border border-ink-900/30 font-mono dark:border-kraft-100/30"
                    >
                      +
                    </button>
                    <span className="font-mono text-xs">
                      {r.max - spent} / {r.max}
                    </span>
                    <button
                      type="button"
                      onClick={() => adjustResourceSpent(character, r.id, 1, r.max)}
                      className="h-5 w-5 border border-ink-900/30 font-mono dark:border-kraft-100/30"
                    >
                      −
                    </button>
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <p className="font-mono text-xs uppercase tracking-wider text-ink-500 dark:text-kraft-300">Exhaustion</p>
          <span className="font-mono text-xs">{character.state.exhaustion} / 6</span>
        </div>
        <div className="flex gap-1">
          {Array.from({ length: 6 }, (_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setExhaustion(character, character.state.exhaustion === i + 1 ? i : i + 1)}
              className={`h-4 flex-1 border-2 ${
                i < character.state.exhaustion ? 'border-rust-500 bg-rust-500' : 'border-ink-900/30 dark:border-kraft-100/30'
              }`}
              aria-label={`Exhaustion level ${i + 1}`}
            />
          ))}
        </div>
        <p className="mt-1 text-xs text-ink-700 dark:text-kraft-200">
          Each level worsens ability checks, attacks, saves, speed, and (at 6) causes death. Click a filled box to remove exhaustion up to that
          point; a long rest also removes one level.
        </p>
      </div>

      {isDown && (
        <div>
          <p className="mb-1.5 font-mono text-xs uppercase tracking-wider text-ink-500 dark:text-kraft-300">Death Saves</p>
          <div className="flex gap-6">
            <span className="flex items-center gap-1">
              <span className="text-xs">Successes</span>
              {Array.from({ length: 3 }, (_, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setDeathSave(character, 'successes', character.state.deathSaves.successes === i + 1 ? i : i + 1)}
                  className={`h-3 w-3 rounded-full border-2 ${
                    i < character.state.deathSaves.successes ? 'border-olive-500 bg-olive-500' : 'border-ink-900/30 dark:border-kraft-100/30'
                  }`}
                />
              ))}
            </span>
            <span className="flex items-center gap-1">
              <span className="text-xs">Failures</span>
              {Array.from({ length: 3 }, (_, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setDeathSave(character, 'failures', character.state.deathSaves.failures === i + 1 ? i : i + 1)}
                  className={`h-3 w-3 rounded-full border-2 ${
                    i < character.state.deathSaves.failures ? 'border-rust-500 bg-rust-500' : 'border-ink-900/30 dark:border-kraft-100/30'
                  }`}
                />
              ))}
            </span>
          </div>
        </div>
      )}

      <div>
        <p className="mb-1.5 font-mono text-xs uppercase tracking-wider text-ink-500 dark:text-kraft-300">Conditions</p>
        <div className="flex flex-wrap gap-1.5">
          {CONDITIONS.map((ref) => {
            const active = character.state.conditions.some((c) => c.ref === ref);
            return (
              <button
                key={ref}
                type="button"
                onClick={() => toggleCondition(character, ref)}
                className={`rounded-sm border px-2 py-1 font-mono text-[11px] uppercase tracking-wide ${
                  active
                    ? 'border-ink-900 bg-ink-900 text-kraft-50 dark:border-kraft-100 dark:bg-kraft-100 dark:text-ink-900'
                    : 'border-ink-900/25 text-ink-700 hover:border-ink-900/50 dark:border-kraft-100/25 dark:text-kraft-200'
                }`}
              >
                {humanizeCamel(ref)}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

type SpellEntry = Extract<ContentEntry, { kind: 'spell' }>;

function classShortIds(character: Character): string[] {
  return character.build.classes.map((c) => c.classRef.split('/').pop() ?? c.classRef);
}

/**
 * Spells carry no structured damage in the data, so we read what's rollable
 * straight from the description text: every distinct NdM dice expression, plus
 * whether it calls for a spell attack roll. Heuristic, but it turns Fire Bolt's
 * "1d10 fire damage" / "make a ranged spell attack" into real buttons.
 */
function spellRolls(description: string): { hasAttack: boolean; dice: string[] } {
  const hasAttack = /spell attack/i.test(description);
  const dice = [...new Set((description.match(/\b\d+d\d+\b/g) ?? []).map((s) => s.toLowerCase()))];
  return { hasAttack, dice };
}

function SpellList({
  character,
  index,
  grantedSpellRefs,
  spellcasting,
}: {
  character: Character;
  index: Map<string, ContentEntry>;
  grantedSpellRefs: string[];
  spellcasting?: DerivedSheet['spellcasting'];
}) {
  const { flashes, flash } = useRollFlash();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState(false);
  const [query, setQuery] = useState('');

  const grantedSet = new Set(grantedSpellRefs);
  const knownSet = new Set(character.build.knownSpells);
  const allRefs = [...new Set([...character.build.knownSpells, ...grantedSpellRefs])];
  const spells = allRefs
    .map((ref) => index.get(ref))
    .filter((e): e is SpellEntry => e?.kind === 'spell')
    .sort((a, b) => a.data.level - b.data.level || a.name.localeCompare(b.name));

  // Everything on this character's class spell list(s) they don't already have —
  // the pool the spellbook can add from. A spellbook can hold spells you can't
  // cast yet, so no level cap here.
  const shortIds = classShortIds(character);
  const addable = [...index.values()]
    .filter((e): e is SpellEntry => e.kind === 'spell')
    .filter((e) => !knownSet.has(e.id) && !grantedSet.has(e.id) && e.data.classLists.some((c) => shortIds.includes(c)))
    .sort((a, b) => a.data.level - b.data.level || a.name.localeCompare(b.name));
  const q = query.trim().toLowerCase();
  const filteredAddable = q ? addable.filter((e) => e.name.toLowerCase().includes(q)) : addable;

  // Nothing to show for a non-caster with an empty book and no class spell list.
  if (spells.length === 0 && addable.length === 0) return null;

  function toggleExpanded(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <p className="font-mono text-xs uppercase tracking-wider text-ink-500 dark:text-kraft-300">Spellbook</p>
        {addable.length > 0 && (
          <button
            type="button"
            onClick={() => setAdding((v) => !v)}
            className="border border-ink-900/30 px-2 py-0.5 font-mono text-[11px] uppercase tracking-wide hover:border-rust-500 dark:border-kraft-100/30"
          >
            {adding ? 'Done' : '+ Add spell'}
          </button>
        )}
      </div>

      {adding && (
        <div className="mb-3 border-2 border-dashed border-ink-900/25 p-2 dark:border-kraft-100/25">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search your class spell list…"
            className="mb-2 w-full border-b-2 border-dashed border-ink-900/30 bg-transparent px-1 py-1 text-sm outline-none focus:border-rust-500 dark:border-kraft-100/30"
          />
          <ul className="flex max-h-56 flex-col gap-0.5 overflow-y-auto">
            {filteredAddable.slice(0, 60).map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => void addKnownSpell(character, s.id)}
                  className="flex w-full items-baseline justify-between px-1 py-1 text-left text-sm hover:bg-ink-900/5 dark:hover:bg-kraft-100/5"
                >
                  <span>{s.name}</span>
                  <span className="font-mono text-xs text-ink-700 dark:text-kraft-200">{s.data.level === 0 ? 'Cantrip' : `Lvl ${s.data.level}`}</span>
                </button>
              </li>
            ))}
            {filteredAddable.length === 0 && <li className="px-1 py-1 text-sm text-ink-700 dark:text-kraft-200">No matches.</li>}
          </ul>
        </div>
      )}

      {spells.length === 0 ? (
        <p className="text-sm text-ink-700 dark:text-kraft-200">No spells yet.</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {spells.map((s) => {
            const granted = grantedSet.has(s.id);
            return (
              <li key={s.id} className="text-sm">
                <div className="flex items-baseline gap-2">
                  <button type="button" onClick={() => toggleExpanded(s.id)} className="flex flex-1 items-baseline justify-between text-left hover:underline">
                    <span>
                      {s.name}
                      {granted && <span className="ml-1.5 text-xs italic text-ink-500 dark:text-kraft-300">(always prepared)</span>}
                    </span>
                    <span className="font-mono text-xs text-ink-700 dark:text-kraft-200">{s.data.level === 0 ? 'Cantrip' : `Lvl ${s.data.level}`}</span>
                  </button>
                  {/* Granted spells come from a subclass/race, not the spellbook, so there's nothing to remove. */}
                  {!granted && (
                    <button
                      type="button"
                      onClick={() => void removeKnownSpell(character, s.id)}
                      aria-label={`Remove ${s.name}`}
                      className="shrink-0 font-mono text-xs text-ink-500 hover:text-rust-500 dark:text-kraft-300"
                    >
                      ✕
                    </button>
                  )}
                </div>
                {expanded.has(s.id) && (
                  <div className="mt-1">
                    {(() => {
                      const { hasAttack, dice } = spellRolls(s.data.description);
                      if (!hasAttack && dice.length === 0) return null;
                      return (
                        <div className="mb-1.5 flex flex-wrap gap-1.5">
                          {hasAttack && spellcasting && (
                            <RollButton
                              flashKey={`spell-atk-${s.id}`}
                              flashes={flashes}
                              label={`${fmtMod(spellcasting.attackBonus)} Attack`}
                              onClick={() => flash(`spell-atk-${s.id}`, rollCheck(character, `${s.name} spell attack`, spellcasting.attackBonus))}
                            />
                          )}
                          {dice.map((d) => (
                            <RollButton
                              key={d}
                              flashKey={`spell-dmg-${s.id}-${d}`}
                              flashes={flashes}
                              label={d}
                              onClick={() => flash(`spell-dmg-${s.id}-${d}`, rollDamage(character, `${s.name} (${d})`, d, 0))}
                            />
                          ))}
                        </div>
                      );
                    })()}
                    <p className="text-xs text-ink-700 dark:text-kraft-200">{s.data.description}</p>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/** A small dice-roll chip that shows the rolled total once clicked (shared shape with the attack buttons above). */
function RollButton({
  flashKey,
  flashes,
  label,
  onClick,
}: {
  flashKey: string;
  flashes: ReturnType<typeof useRollFlash>['flashes'];
  label: string;
  onClick: () => void;
}) {
  const rolled = flashes[flashKey];
  return (
    <button
      type="button"
      onClick={onClick}
      className={`border px-2 py-0.5 font-mono text-xs transition-colors ${
        rolled ? 'border-rust-500 bg-rust-500/10' : 'border-ink-900/30 hover:border-rust-500 dark:border-kraft-100/30'
      }`}
    >
      {rolled ? (
        <>
          <span className="text-rust-500">{rolled.total}</span> <span className="text-[10px]">[{rolled.rolls.join(', ')}]</span>
        </>
      ) : (
        label
      )}
    </button>
  );
}
