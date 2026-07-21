import MiniSearch from 'minisearch';
import type { ContentEntry } from '@/schema/content';

interface SearchDoc {
  id: string;
  name: string;
  searchText: string;
}

function extractSearchText(entry: ContentEntry): string {
  switch (entry.kind) {
    case 'spell':
      return `${entry.data.school} ${entry.data.description}`;
    case 'item':
      return entry.data.description;
    case 'feat':
      return entry.data.description;
    case 'feature':
      return entry.data.description;
    case 'condition':
      return entry.data.description;
    default:
      return '';
  }
}

export function buildSearchIndex(entries: ContentEntry[]): MiniSearch<SearchDoc> {
  const mini = new MiniSearch<SearchDoc>({
    idField: 'id',
    fields: ['name', 'searchText'],
    storeFields: ['id'],
    searchOptions: { boost: { name: 3 }, prefix: true, fuzzy: 0.2 },
  });
  mini.addAll(
    entries.map((entry) => ({ id: entry.id, name: entry.name, searchText: extractSearchText(entry) })),
  );
  return mini;
}

export function search(index: MiniSearch<SearchDoc>, query: string): string[] {
  if (!query.trim()) return [];
  return index.search(query).map((result) => result.id);
}
