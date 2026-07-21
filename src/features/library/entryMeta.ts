import type { ContentEntry } from '@/schema/content';
import { humanizeCamel } from '@/lib/text';

const ORDINAL_LEVEL = ['Cantrip', '1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th'];

/** One-line summary shown under an entry's name in list views. */
export function entrySummary(entry: ContentEntry): string {
  switch (entry.kind) {
    case 'spell':
      return entry.data.level === 0
        ? `${ORDINAL_LEVEL[0]} · ${entry.data.school}`
        : `${ORDINAL_LEVEL[entry.data.level]}-level · ${entry.data.school}`;
    case 'item': {
      const parts: string[] = [humanizeCamel(entry.data.category)];
      if (entry.data.rarity !== 'mundane') parts.push(humanizeCamel(entry.data.rarity));
      if (entry.data.cost) parts.push(`${entry.data.cost.amount} ${entry.data.cost.currency}`);
      return parts.join(' · ');
    }
    default:
      return entry.kind;
  }
}
