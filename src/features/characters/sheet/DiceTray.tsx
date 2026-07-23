import { useEffect, useRef, useState } from 'react';
import { rollDice, rollDie } from '@/engine/dice';

const DICE = [4, 6, 8, 10, 12, 20, 100] as const;
type Die = (typeof DICE)[number];

interface TrayResult {
  formula: string;
  groups: { die: Die; rolls: number[] }[];
  modifier: number;
  total: number;
}

/**
 * A freeform dice roller that pops out from the right edge of the sheet. Lets a
 * player build an arbitrary pool (any number of d4–d100), add a flat modifier,
 * and roll them together — the manual escape hatch for anything the sheet doesn't
 * roll for you (spell attack/damage, saving-throw effects, ability checks a DM
 * calls for). Results optionally flow into the character's roll log.
 */
export function DiceTray({ onRoll }: { onRoll?: (label: string, formula: string, rolls: number[], total: number) => void }) {
  const [open, setOpen] = useState(false);
  const [counts, setCounts] = useState<Record<Die, number>>({ 4: 0, 6: 0, 8: 0, 10: 0, 12: 0, 20: 0, 100: 0 });
  const [modifier, setModifier] = useState(0);
  const [result, setResult] = useState<TrayResult | null>(null);
  // While rolling, the big number flickers through random faces for a beat before
  // settling on the real total — a lightweight "dice tumbling" animation.
  const [rolling, setRolling] = useState(false);
  const [tumble, setTumble] = useState(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  function adjust(die: Die, delta: number) {
    setCounts((c) => ({ ...c, [die]: Math.max(0, Math.min(50, c[die] + delta)) }));
  }
  function clear() {
    setCounts({ 4: 0, 6: 0, 8: 0, 10: 0, 12: 0, 20: 0, 100: 0 });
    setModifier(0);
    setResult(null);
  }

  function roll() {
    const groups = DICE.filter((die) => counts[die] > 0).map((die) => ({ die, rolls: rollDice(counts[die], die).rolls }));
    if (groups.length === 0 && modifier === 0) return;
    const allRolls = groups.flatMap((g) => g.rolls);
    const total = allRolls.reduce((sum, r) => sum + r, 0) + modifier;
    const formula =
      groups.map((g) => `${g.rolls.length}d${g.die}`).join(' + ') + (modifier !== 0 ? ` ${modifier > 0 ? '+' : '−'} ${Math.abs(modifier)}` : '');
    const finalResult: TrayResult = { formula: formula || `${modifier}`, groups, modifier, total };

    // Animate: flicker a plausible-range face a few times, then reveal.
    timers.current.forEach(clearTimeout);
    timers.current = [];
    const maxFace = Math.max(...groups.map((g) => g.die), 6);
    setRolling(true);
    const ticks = 8;
    for (let i = 0; i < ticks; i++) {
      timers.current.push(setTimeout(() => setTumble(rollDie(maxFace * Math.max(1, allRolls.length))), i * 55));
    }
    timers.current.push(
      setTimeout(() => {
        setRolling(false);
        setResult(finalResult);
        onRoll?.('Dice Tray', finalResult.formula, allRolls, total);
      }, ticks * 55),
    );
  }

  const selectedCount = DICE.reduce((sum, die) => sum + counts[die], 0);

  return (
    <>
      {/* Right-edge pull tab, always reachable while playing. */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="fixed right-0 top-1/3 z-40 flex items-center gap-1 rounded-l-md border-2 border-r-0 border-ink-900 bg-kraft-50 px-2 py-3 font-mono text-xs uppercase tracking-wide text-ink-900 shadow-md [writing-mode:vertical-rl] hover:bg-ink-900 hover:text-kraft-50 dark:border-kraft-100 dark:bg-ink-900 dark:text-kraft-100 dark:hover:bg-kraft-100 dark:hover:text-ink-900"
      >
        🎲 Dice
      </button>

      {open && (
        <div className="fixed right-0 top-0 z-40 flex h-full w-72 max-w-[85vw] flex-col gap-4 overflow-y-auto border-l-2 border-ink-900 bg-kraft-50 p-4 shadow-2xl dark:border-kraft-100 dark:bg-ink-900">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-lg text-ink-900 dark:text-kraft-100">Dice Tray</h2>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close dice tray"
              className="font-mono text-sm text-ink-700 hover:text-rust-500 dark:text-kraft-200"
            >
              ✕
            </button>
          </div>

          <div className="flex flex-col gap-1.5">
            {DICE.map((die) => (
              <div key={die} className="flex items-center justify-between gap-2">
                <span className="w-12 font-mono text-sm">d{die}</span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => adjust(die, -1)}
                    className="h-6 w-6 border border-ink-900/30 font-mono dark:border-kraft-100/30"
                    aria-label={`Remove a d${die}`}
                  >
                    −
                  </button>
                  <span className="w-6 text-center font-mono text-sm">{counts[die]}</span>
                  <button
                    type="button"
                    onClick={() => adjust(die, 1)}
                    className="h-6 w-6 border border-ink-900/30 font-mono dark:border-kraft-100/30"
                    aria-label={`Add a d${die}`}
                  >
                    +
                  </button>
                </div>
              </div>
            ))}
            <div className="mt-1 flex items-center justify-between gap-2">
              <span className="w-12 font-mono text-sm">Mod</span>
              <input
                type="number"
                value={modifier}
                onChange={(e) => setModifier(Number(e.target.value) || 0)}
                className="w-24 border-b-2 border-dashed border-ink-900/30 bg-transparent px-1 py-1 text-center font-mono text-sm outline-none focus:border-rust-500 dark:border-kraft-100/30"
              />
            </div>
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={roll}
              disabled={(selectedCount === 0 && modifier === 0) || rolling}
              className="flex-1 border-2 border-ink-900 bg-ink-900 px-3 py-2 font-mono text-xs uppercase tracking-wide text-kraft-50 disabled:opacity-30 dark:border-kraft-100 dark:bg-kraft-100 dark:text-ink-900"
            >
              {rolling ? 'Rolling…' : 'Roll'}
            </button>
            <button
              type="button"
              onClick={clear}
              className="border-2 border-ink-900/30 px-3 py-2 font-mono text-xs uppercase tracking-wide text-ink-700 hover:border-rust-500 dark:border-kraft-100/30 dark:text-kraft-200"
            >
              Clear
            </button>
          </div>

          {rolling && (
            <div className="border-2 border-dashed border-ink-900/25 p-3 text-center dark:border-kraft-100/25">
              <div className="my-1 inline-block animate-spin font-display text-4xl text-rust-500 [animation-duration:0.35s]">{tumble || '🎲'}</div>
            </div>
          )}

          {!rolling && result && (
            <div className="border-2 border-dashed border-ink-900/25 p-3 dark:border-kraft-100/25">
              <div className="font-mono text-xs text-ink-500 dark:text-kraft-300">{result.formula}</div>
              <div className="my-1 font-display text-4xl text-rust-500 motion-safe:animate-[diceReveal_0.3s_ease-out]">{result.total}</div>
              <div className="flex flex-col gap-0.5">
                {result.groups.map((g) => (
                  <div key={g.die} className="font-mono text-xs text-ink-700 dark:text-kraft-200">
                    d{g.die}: [{g.rolls.join(', ')}]
                  </div>
                ))}
                {result.modifier !== 0 && (
                  <div className="font-mono text-xs text-ink-700 dark:text-kraft-200">
                    mod: {result.modifier > 0 ? '+' : ''}
                    {result.modifier}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}
