import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from './schema.js';

/**
 * Lazy database handle.
 *
 * Two constraints shape this:
 *
 * 1. neon() throws when DATABASE_URL is unset, and module-level code runs at
 *    import time — so eager initialization would crash the whole API (health
 *    checks and the AI proxy included) on any deployment without a database,
 *    which is a state this app supports.
 *
 * 2. It is deliberately NOT a Proxy wrapper. Wrapping the client in a Proxy is
 *    the usual trick for lazy init, but libraries that introspect the handle
 *    (checking for methods, iterating properties) get intercepted and hang with
 *    no error. A plain function has none of that surface.
 */
let cached: ReturnType<typeof create> | null = null;

function create() {
  return drizzle(neon(process.env.DATABASE_URL!), { schema });
}

/** True when a database is configured; sync and feedback both require one. */
export const dbConfigured = Boolean(process.env.DATABASE_URL);

export function getDb(): ReturnType<typeof create> {
  if (!cached) cached = create();
  return cached;
}
