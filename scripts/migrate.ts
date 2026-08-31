import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { neon } from '@neondatabase/serverless';

/**
 * Applies drizzle/*.sql in filename order, recording each in a
 * schema_migrations table so re-runs are no-ops.
 *
 * Hand-rolled rather than drizzle-kit's migrator because the first migration
 * creates a sequence that drizzle-kit doesn't model (see drizzle/0000_init.sql)
 * — plain SQL files keep what actually runs visible and reviewable.
 *
 * Vercel has no release phase, so this runs from CI (or by hand) before a
 * deploy, never at request time.
 */
const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is not set. Run `vercel env pull .env` first.');
  process.exit(1);
}

const sql = neon(url);
const dir = path.join(process.cwd(), 'drizzle');

await sql`CREATE TABLE IF NOT EXISTS schema_migrations (
  name text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
)`;

const applied = new Set(
  (await sql`SELECT name FROM schema_migrations`).map((r) => r.name as string),
);

const files = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort();
let ran = 0;

for (const file of files) {
  if (applied.has(file)) continue;
  const body = await readFile(path.join(dir, file), 'utf8');

  // drizzle-kit separates statements with this marker; the HTTP driver takes
  // one statement per call, so they're split rather than sent as a batch.
  for (const statement of body.split('--> statement-breakpoint')) {
    const trimmed = statement.trim();
    if (trimmed) await sql.query(trimmed);
  }

  await sql`INSERT INTO schema_migrations (name) VALUES (${file})`;
  console.info(`[migrate] applied ${file}`);
  ran += 1;
}

console.info(ran === 0 ? '[migrate] already up to date' : `[migrate] applied ${ran} migration(s)`);
