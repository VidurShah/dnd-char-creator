import { useCallback, useRef, useState } from 'react';
import type { DiceRollResult } from '@/engine/dice';

/**
 * Tracks the most recent roll per UI key (e.g. a skill or attack button) so
 * the result can flash inline right where it was rolled, instead of forcing
 * a trip to the roll log to see what happened.
 */
export function useRollFlash() {
  const [flashes, setFlashes] = useState<Record<string, DiceRollResult>>({});
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const flash = useCallback((key: string, result: DiceRollResult) => {
    setFlashes((f) => ({ ...f, [key]: result }));
    clearTimeout(timers.current[key]);
    timers.current[key] = setTimeout(() => {
      setFlashes((f) => {
        const next = { ...f };
        delete next[key];
        return next;
      });
    }, 3500);
  }, []);

  return { flashes, flash };
}
