import { defineConfig } from 'drizzle-kit';

/**
 * Migrations are generated offline (`pnpm db:generate`) and committed, then
 * applied with `pnpm db:migrate`. Neither drizzle-kit nor tsx reads .env on its
 * own, hence the dotenv-cli wrapper in those scripts.
 */
export default defineConfig({
  schema: './server/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: { url: process.env.DATABASE_URL ?? '' },
});
