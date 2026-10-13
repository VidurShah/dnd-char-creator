/**
 * Seeds data/{2014,2024}/conditions.json from the 5e-bits SRD API
 * (https://www.dnd5eapi.co): SRD 5.1 conditions for 5e, SRD 5.2 for 5.5e.
 * Run with: pnpm seed:conditions
 *
 * Conditions are the rules a table looks up most mid-session, and the advisor
 * can only cite what exists in the content index — so they ship as real
 * `condition` entries rather than the bare name list in
 * src/features/characters/sheet/conditions.ts.
 *
 * The two editions differ in substance (2024 rewrote Exhaustion, Grappled,
 * Invisible and more), which is why each is fetched from its own SRD rather
 * than one copied to both.
 */
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { ContentEntrySchema, type ContentEntry } from '../../src/schema';

const API_ROOT = 'https://www.dnd5eapi.co';

const EDITIONS = [
  { edition: '2014', api: '2014', book: 'SRD5.1' },
  { edition: '2024', api: '2024', book: 'SRD5.2' },
] as const;

interface ApiCondition {
  index: string;
  name: string;
  /** 2014 shape: one bullet per string. */
  desc?: string[];
  /** 2024 shape: one Markdown-ish string. */
  description?: string;
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`GET ${url} -> ${res.status}`);
  return res.json() as Promise<T>;
}

for (const { edition, api, book } of EDITIONS) {
  const list = await fetchJson<{ results: { url: string }[] }>(`${API_ROOT}/api/${api}/conditions`);
  const conditions = await Promise.all(list.results.map((r) => fetchJson<ApiCondition>(API_ROOT + r.url)));

  const entries: ContentEntry[] = conditions
    .map((c) =>
      ContentEntrySchema.parse({
        id: `${edition}/condition/${c.index}`,
        edition,
        name: c.name,
        source: { book },
        origin: 'seed',
        schemaVersion: 1,
        kind: 'condition',
        // SRD 5.2 bolds each effect's lead-in ("**Speed 0.**"); every renderer
        // here shows descriptions as plain text, so the markers would print.
        data: { description: (c.description ?? (c.desc ?? []).join('\n')).replace(/\*\*/g, '').trim() },
      }),
    )
    .sort((a, b) => a.name.localeCompare(b.name));

  const out = path.resolve(import.meta.dirname, `../../data/${edition}/conditions.json`);
  writeFileSync(out, JSON.stringify(entries, null, 2) + '\n');
  console.info(`${edition}: wrote ${entries.length} conditions to ${path.relative(process.cwd(), out)}`);
}
