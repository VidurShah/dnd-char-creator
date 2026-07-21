/**
 * Runs LLM-assisted extraction over a split rulebook's page chunks (see
 * split_pdf.py), validates results against our real schemas, dedupes against
 * already-seeded SRD content, and writes pending candidates for human review.
 *
 * Usage: pnpm extract:run tashas 2014 TCE
 *        pnpm extract:run phb2024 2024 PHB2024
 *        pnpm extract:run phb2024 2024 PHB2024 --start=5   (resume from chunk 5)
 */
import { readdirSync, writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { loadSeedEntries } from './loadSeedEntries';
import type { PendingExtractionEntry } from '../../src/schema';
import { makeClient, uploadPdf, extractChunk } from './geminiClient';
import { mapCandidate, isSrdDuplicate } from './validate';

const BOOK_LABELS: Record<string, string> = { tashas: "Tasha's Cauldron of Everything", phb2024: "Player's Handbook (2024)" };

async function main() {
  const rawArgs = process.argv.slice(2);
  const startArg = rawArgs.find((a) => a.startsWith('--start='));
  const startChunk = startArg ? Number(startArg.split('=')[1]) : 1;
  const [bookId, edition, sourceBook] = rawArgs.filter((a) => !a.startsWith('--')) as [string, '2014' | '2024', 'TCE' | 'PHB2024'];
  if (!bookId || !edition || !sourceBook) {
    console.error('Usage: tsx scripts/extract/extract.ts <bookId> <edition> <sourceBook> [--start=N]');
    process.exit(1);
  }

  const splitDir = path.resolve(import.meta.dirname, '../../sources/_split', bookId);
  const chunkFiles = readdirSync(splitDir)
    .filter((f) => f.endsWith('.pdf'))
    .sort()
    .slice(startChunk - 1);
  if (chunkFiles.length === 0) {
    console.error(`No split chunks found in ${splitDir} — run split_pdf.py first.`);
    process.exit(1);
  }

  console.log(`Loading seed content for ${edition} (for SRD dedupe)...`);
  const seedEntries = loadSeedEntries(edition);

  const ai = makeClient();

  const outDir = path.resolve(import.meta.dirname, '../../data/packs/_pending');
  mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, `${bookId}.json`);

  // Resuming (--start=N) or re-running keeps whatever's already on disk instead of clobbering it.
  const pending: PendingExtractionEntry[] =
    startChunk > 1 && existsSync(outPath) ? (JSON.parse(readFileSync(outPath, 'utf-8')) as PendingExtractionEntry[]) : [];

  function save() {
    writeFileSync(outPath, JSON.stringify(pending, null, 2));
  }

  for (const [i, chunkFile] of chunkFiles.entries()) {
    const chunkNumber = startChunk + i;
    console.log(`\n[chunk ${chunkNumber}] Uploading ${chunkFile}...`);
    const filePath = path.join(splitDir, chunkFile);

    try {
      const file = await uploadPdf(ai, filePath);

      console.log(`Extracting from ${chunkFile}...`);
      const candidates = await extractChunk(ai, file.uri!, file.mimeType!, BOOK_LABELS[bookId] ?? bookId, 1, 9999);
      console.log(`Got ${candidates.length} candidates from ${chunkFile}`);

      for (const candidate of candidates) {
        if (isSrdDuplicate(candidate, seedEntries)) continue; // already have this one from the free SRD

        const { entry, error } = mapCandidate(candidate, edition, sourceBook);
        if (!entry) {
          pending.push({
            entry: { id: 'invalid', edition, kind: 'feature', name: candidate.name, source: { book: sourceBook }, origin: 'extracted', schemaVersion: 1, data: { description: candidate.description } },
            page: candidate.page,
            verbatimQuote: candidate.verbatimQuote,
            confidence: 0,
            status: 'rejected',
            conflictNote: `Failed to map: ${error}`,
          });
          continue;
        }
        pending.push({ entry, page: candidate.page, verbatimQuote: candidate.verbatimQuote, confidence: candidate.confidence, status: 'pending' });
      }

      save(); // persist after every chunk — a later chunk failing shouldn't lose earlier work
    } catch (err) {
      console.error(`Chunk ${chunkNumber} (${chunkFile}) failed, saving progress so far and stopping:`, err);
      save();
      console.log(`\nResume with: pnpm extract:run ${bookId} ${edition} ${sourceBook} --start=${chunkNumber}`);
      process.exit(1);
    }
  }

  console.log(`\nWrote ${pending.length} pending entries to ${outPath}`);
  console.log(`Run "pnpm extract:review ${bookId}" to review them.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
