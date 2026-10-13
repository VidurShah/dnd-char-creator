import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import * as schema from '../db/schema.js';

/**
 * An in-process Postgres (PGlite) with the real migrations applied.
 *
 * The conflict guard, the rev sequence, and the quota upserts are all SQL —
 * their correctness lives in Postgres semantics, so a mocked query builder
 * would test nothing that matters. PGlite is actual Postgres compiled to WASM:
 * no Docker, no network, works the same locally and in CI.
 *
 * Migrations are applied the same way scripts/migrate.ts applies them, so a
 * migration that only works against Neon fails here first.
 */
export async function createTestDb() {
  const client = new PGlite();
  const dir = path.resolve(import.meta.dirname, '../../drizzle');
  const files = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort();
  for (const file of files) {
    const body = await readFile(path.join(dir, file), 'utf8');
    for (const statement of body.split('--> statement-breakpoint')) {
      if (statement.trim()) await client.exec(statement);
    }
  }
  const db = drizzle(client, { schema });
  return {
    db,
    client,
    /** Empties every table between tests; the rev sequence keeps counting, as it would in production. */
    reset: () => client.exec('TRUNCATE characters, content_entries, feedback, ai_usage'),
  };
}
