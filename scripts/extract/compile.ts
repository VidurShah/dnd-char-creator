/**
 * Reads data/packs/_pending/<book>.json plus the reviewer's downloaded
 * <book>-decisions.json, and compiles every approved entry into the final,
 * schema-validated pack at data/packs/<book>.pack.json — gitignored, never
 * bundled with the app, imported later via Library > Import Pack.
 *
 * Usage: pnpm extract:compile tashas
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { PackSchema, type PendingExtractionEntry } from '../../src/schema';

async function main() {
  const bookId = process.argv[2];
  if (!bookId) {
    console.error('Usage: tsx scripts/extract/compile.ts <bookId>');
    process.exit(1);
  }

  const pendingDir = path.resolve(import.meta.dirname, '../../data/packs/_pending');
  const pendingPath = path.join(pendingDir, `${bookId}.json`);
  const decisionsPath = path.join(pendingDir, `${bookId}-decisions.json`);

  if (!existsSync(decisionsPath)) {
    console.error(`No decisions file at ${decisionsPath} — review.ts's "Download decisions.json" button saves there.`);
    process.exit(1);
  }

  const pending = JSON.parse(readFileSync(pendingPath, 'utf-8')) as PendingExtractionEntry[];
  const decisions = JSON.parse(readFileSync(decisionsPath, 'utf-8')) as Record<string, 'approved' | 'rejected'>;

  const approved = pending.filter((p) => decisions[p.entry.id] === 'approved');
  console.log(`${approved.length} of ${pending.length} entries approved.`);

  const pack = PackSchema.parse({
    id: `${bookId}-${Date.now()}`,
    name: bookId,
    sourceBook: pending[0]?.entry.source.book ?? 'custom',
    edition: pending[0]?.entry.edition ?? '2014',
    createdAt: Date.now(),
    entries: approved.map((p) => p.entry),
  });

  const outDir = path.resolve(import.meta.dirname, '../../data/packs');
  const outPath = path.join(outDir, `${bookId}.pack.json`);
  writeFileSync(outPath, JSON.stringify(pack, null, 2));
  console.log(`Wrote ${pack.entries.length} entries to ${outPath}`);
  console.log('Import it in the app via Library > Import Pack.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
