/**
 * Schema-checks curate.py's staging output before any of it is merged into the
 * committed data files. Validating the merged result is `pnpm validate:data`;
 * this is the earlier gate, on content that hasn't landed yet.
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { ContentEntrySchema } from '../../src/schema';

for (const edition of ['2014', '2024']) {
  const filePath = path.resolve(import.meta.dirname, '../../data/packs/_curated', `${edition}.json`);
  if (!existsSync(filePath)) {
    console.log(`${edition}: no staging file at data/packs/_curated/${edition}.json — run curate.py first, skipping`);
    continue;
  }
  const entries = JSON.parse(readFileSync(filePath, 'utf-8'));
  let failures = 0;
  for (const entry of entries) {
    const result = ContentEntrySchema.safeParse(entry);
    if (!result.success) {
      failures++;
      console.error(`FAIL [${edition}] ${entry.name} (${entry.kind}):`, result.error.issues.slice(0, 2));
    }
  }
  console.log(`${edition}: ${entries.length - failures}/${entries.length} valid`);
}
