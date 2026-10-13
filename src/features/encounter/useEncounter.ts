import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db/dexie';
import type { Edition } from '@/schema/common';
import type { ContentEntry } from '@/schema/content';
import { EncounterSchema, type Encounter } from '@/schema/encounter';
import { loadContentIndex } from '@/content/loader';
import { emptyEncounter } from './encounter';

const ENCOUNTER_KEY = 'encounter';

function parse(value: unknown): Encounter {
  const parsed = EncounterSchema.safeParse(value);
  return parsed.success ? parsed.data : emptyEncounter();
}

/**
 * The single active encounter, live from IndexedDB, plus an updater.
 *
 * The updater reads the stored encounter and writes the next one inside one
 * transaction rather than deriving from the last render: two quick clicks
 * (damage, then next turn) would otherwise both start from the same snapshot
 * and the second would silently undo the first.
 */
export function useEncounter(): {
  encounter: Encounter | undefined;
  update: (fn: (enc: Encounter) => Encounter) => Promise<void>;
} {
  const stored = useLiveQuery(async () => (await db.settings.get(ENCOUNTER_KEY))?.value ?? null, []);
  const encounter = useMemo(() => (stored === undefined ? undefined : parse(stored)), [stored]);

  const update = useCallback(
    (fn: (enc: Encounter) => Encounter) =>
      db.transaction('rw', db.settings, async () => {
        const current = parse((await db.settings.get(ENCOUNTER_KEY))?.value);
        await db.settings.put({ key: ENCOUNTER_KEY, value: fn(current) });
      }),
    [],
  );

  return { encounter, update };
}

/**
 * Content indexes for every edition present in the fight, loaded on demand. A
 * table runs one edition, but nothing stops a player bringing a 2014 character
 * to a 2024 game, and each character must be computed against its own rules.
 */
export function useEditionIndexes(editions: Edition[]): Partial<Record<Edition, Map<string, ContentEntry>>> {
  const [indexes, setIndexes] = useState<Partial<Record<Edition, Map<string, ContentEntry>>>>({});
  /** Bumped when the network comes back, to retry an edition that failed to load offline. */
  const [attempt, setAttempt] = useState(0);
  const key = [...new Set(editions)].sort().join(',');

  useEffect(() => {
    const retry = () => setAttempt((n) => n + 1);
    window.addEventListener('online', retry);
    return () => window.removeEventListener('online', retry);
  }, []);

  useEffect(() => {
    let cancelled = false;
    for (const edition of key ? (key.split(',') as Edition[]) : []) {
      loadContentIndex(edition)
        .then((entries) => {
          if (cancelled) return;
          setIndexes((prev) => (prev[edition] ? prev : { ...prev, [edition]: new Map(entries.map((e) => [e.id, e])) }));
        })
        // The loader drops a failed load from its cache, so the 'online'
        // retry above refetches instead of replaying the failure.
        .catch((err: unknown) => console.warn(`[encounter] could not load ${edition} content`, err));
    }
    return () => {
      cancelled = true;
    };
  }, [key, attempt]);

  return indexes;
}
