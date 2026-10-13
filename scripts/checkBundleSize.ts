/**
 * Fails the build when the app shell's JavaScript grows past budget.
 *
 * First load used to ship 3.5 MB because both editions' seed content was
 * statically imported (#11). The fix moved seed content into lazily loaded
 * chunks under dist/assets/data/, and nothing but this check stops a stray
 * static import from quietly pulling it all back into the shell.
 *
 * Only top-level dist/assets/*.js is counted: that is the code the service
 * worker precaches and every visitor downloads. Seed-content chunks are fetched
 * per edition on demand and are deliberately excluded.
 *
 * Run after `pnpm build`.
 */
import { readdirSync, statSync } from 'node:fs';
import path from 'node:path';

/** Budgets in KiB, with headroom over the post-#11 baseline (~860 KiB shell, ~260 KiB entry). */
const SHELL_BUDGET_KIB = 1100;
const ENTRY_BUDGET_KIB = 400;

const assetsDir = path.resolve('dist/assets');
const files = readdirSync(assetsDir)
  .filter((f) => f.endsWith('.js'))
  .map((f) => ({ name: f, kib: statSync(path.join(assetsDir, f)).size / 1024 }));

if (files.length === 0) {
  console.error('No JS found in dist/assets — run `pnpm build` first.');
  process.exit(1);
}

const shell = files.reduce((sum, f) => sum + f.kib, 0);
const entry = files.filter((f) => f.name.startsWith('index-'));
const entryKib = entry.reduce((sum, f) => sum + f.kib, 0);

for (const f of [...files].sort((a, b) => b.kib - a.kib).slice(0, 5)) {
  console.log(`  ${f.kib.toFixed(0).padStart(6)} KiB  ${f.name}`);
}
console.log(`App shell JS: ${shell.toFixed(0)} KiB (budget ${SHELL_BUDGET_KIB})`);
console.log(`Entry chunk:  ${entryKib.toFixed(0)} KiB (budget ${ENTRY_BUDGET_KIB})`);

const failures: string[] = [];
if (shell > SHELL_BUDGET_KIB) failures.push(`app shell JS is ${shell.toFixed(0)} KiB, over the ${SHELL_BUDGET_KIB} KiB budget`);
if (entryKib > ENTRY_BUDGET_KIB) failures.push(`entry chunk is ${entryKib.toFixed(0)} KiB, over the ${ENTRY_BUDGET_KIB} KiB budget`);

if (failures.length > 0) {
  console.error(`\nBundle size check failed: ${failures.join('; ')}.`);
  console.error('Is seed content (data/**) being statically imported somewhere? See src/content/loader.ts.');
  process.exit(1);
}
