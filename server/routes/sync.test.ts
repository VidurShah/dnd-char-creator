import { describe, expect, it } from 'vitest';
import { pageRecords } from './sync.js';
import type { SyncRecord } from '../../src/schema/sync.js';

/**
 * The +1 over-fetch invariant. See pageRecords()'s comment for why inferring
 * hasMore from the merged length alone truncates a large first sync.
 */
function rows(table: SyncRecord['table'], count: number, startRev: number): SyncRecord[] {
  return Array.from({ length: count }, (_, i) => ({
    table,
    id: `${table}-${startRev + i}`,
    doc: {},
    updatedAt: 1,
    deleted: false,
    rev: startRev + i,
  }));
}

describe('pageRecords', () => {
  it('reports hasMore when one table alone overflows the page', () => {
    // The regression: 250 characters, no custom content. Queried with the +1
    // the table returns 201, so the overflow is visible even though the other
    // table contributed nothing.
    const { records, hasMore } = pageRecords([...rows('characters', 201, 1)], 200);
    expect(records).toHaveLength(200);
    expect(hasMore).toBe(true);
  });

  it('does not report hasMore when the tables exactly fill one page', () => {
    const { records, hasMore } = pageRecords([...rows('characters', 200, 1)], 200);
    expect(records).toHaveLength(200);
    expect(hasMore).toBe(false);
  });

  it('reports hasMore when the two tables overflow only together', () => {
    const all = [...rows('characters', 150, 1), ...rows('content', 150, 151)];
    const { records, hasMore } = pageRecords(all, 200);
    expect(records).toHaveLength(200);
    expect(hasMore).toBe(true);
  });

  it('orders the merged page by rev across both tables', () => {
    // Interleaved revs: both tables draw from one sequence, so a page must be
    // ordered globally or the client's cursor would skip rows.
    const all = [...rows('characters', 3, 1), ...rows('content', 3, 4)].reverse();
    const { records, hasMore } = pageRecords(all, 200);
    expect(records.map((r) => r.rev)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(hasMore).toBe(false);
  });

  it('handles an empty result', () => {
    expect(pageRecords([], 200)).toEqual({ records: [], hasMore: false });
  });
});
