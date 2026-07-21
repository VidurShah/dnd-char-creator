import { useEffect, useMemo, useState } from 'react';
import type { Edition } from '@/schema/common';
import type { ContentEntry } from '@/schema/content';
import { loadContentIndex } from './loader';
import { buildSearchIndex, search } from './search';

export function useContentIndex(edition: Edition) {
  const [entries, setEntries] = useState<ContentEntry[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    setEntries(null);
    loadContentIndex(edition).then((loaded) => {
      if (!cancelled) setEntries(loaded);
    });
    return () => {
      cancelled = true;
    };
  }, [edition]);

  const byId = useMemo(() => {
    const map = new Map<string, ContentEntry>();
    for (const entry of entries ?? []) map.set(entry.id, entry);
    return map;
  }, [entries]);

  const searchIndex = useMemo(() => buildSearchIndex(entries ?? []), [entries]);

  function searchEntries(query: string): ContentEntry[] {
    const ids = search(searchIndex, query);
    return ids.map((id) => byId.get(id)).filter((entry): entry is ContentEntry => entry != null);
  }

  return { entries: entries ?? [], loading: entries === null, byId, searchEntries };
}
