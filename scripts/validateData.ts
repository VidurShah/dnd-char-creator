#!/usr/bin/env tsx
/**
 * Zod-validates every seed + extraction JSON file in data/ end to end, plus a
 * referential-integrity pass (every featureRef/parentClassRef/subclassRef/
 * grantedSpellsByLevel ref actually resolves to an entry that exists). Run
 * after any hand-edit to data/**\/*.json or scripts/seed|extract output.
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { ContentEntrySchema, type ContentEntry } from '../src/schema/content';
import { ClassGuidanceSchema } from '../src/schema/guidance';

const ROOT = path.resolve(import.meta.dirname, '..');
const EDITIONS = ['2014', '2024'] as const;

function loadJson(filePath: string): unknown[] {
  return JSON.parse(readFileSync(filePath, 'utf-8'));
}

function collectFiles(edition: (typeof EDITIONS)[number]): string[] {
  const dir = path.join(ROOT, 'data', edition);
  const files = ['spells.json', 'items.json', 'feats.json', 'species.json', 'backgrounds.json', 'features.json']
    .map((f) => path.join(dir, f))
    .filter(existsSync);
  const classesDir = path.join(dir, 'classes');
  if (existsSync(classesDir)) {
    for (const f of readdirSync(classesDir)) files.push(path.join(classesDir, f));
  }
  return files;
}

let totalEntries = 0;
let totalFailures = 0;
let duplicateIds = 0;
const allEntries: ContentEntry[] = [];

for (const edition of EDITIONS) {
  let editionEntries = 0;
  let editionFailures = 0;
  // Id uniqueness is checked per edition, against the file each id was first
  // seen in. Two distinct entries sharing an id silently clobber each other
  // wherever entries are merged into a Map by id (content loader, search
  // index, computeSheet) — see CLAUDE.md. This has bitten twice: the Psionic
  // Power collision during Tasha's curation, and the Barbarian's level-13 vs
  // level-17 Improved Brutal Strike.
  const idSources = new Map<string, string>();
  for (const file of collectFiles(edition)) {
    const raw = loadJson(file);
    for (const entry of raw) {
      editionEntries++;
      const result = ContentEntrySchema.safeParse(entry);
      if (!result.success) {
        editionFailures++;
        const name = (entry as { name?: string })?.name ?? '<unnamed>';
        console.error(`FAIL [${edition}] ${path.basename(file)} :: ${name}`);
        for (const issue of result.error.issues.slice(0, 3)) console.error(`  - ${issue.path.join('.')}: ${issue.message}`);
      } else {
        const previous = idSources.get(result.data.id);
        if (previous) {
          duplicateIds++;
          console.error(`DUPLICATE ID [${edition}] "${result.data.id}" in ${path.basename(file)} — already defined in ${previous}`);
        } else {
          idSources.set(result.data.id, path.basename(file));
        }
        allEntries.push(result.data);
      }
    }
  }
  console.log(`${edition}: ${editionEntries - editionFailures}/${editionEntries} entries valid`);
  totalEntries += editionEntries;
  totalFailures += editionFailures;
}

// Referential integrity: every ref a class/subclass/species points at must resolve to a real entry.
const byId = new Map(allEntries.map((e) => [e.id, e]));
let danglingRefs = 0;

function checkRef(ref: string, context: string) {
  if (!byId.has(ref)) {
    danglingRefs++;
    console.error(`DANGLING REF: ${context} -> "${ref}" does not exist`);
  }
}

/**
 * Background/class equipment stores item refs as bare slugs ("greataxe") rather
 * than full ids ("2014/item/greataxe"), so they need the same slug-or-id match
 * the runtime uses. Kept deliberately in sync with `resolveItemRef` in
 * src/features/characters/builder/resolveItemRef.ts — if that matching rule
 * changes, change it here too, or the validator stops reflecting what the app
 * can actually resolve.
 */
const itemsByEdition = new Map<string, ContentEntry[]>();
function checkItemRef(ref: string, context: string) {
  const edition = ref.includes('/') ? ref.split('/')[0] : context.split('/')[0];
  let items = itemsByEdition.get(edition);
  if (!items) {
    items = allEntries.filter((e) => e.kind === 'item' && e.edition === edition);
    itemsByEdition.set(edition, items);
  }
  const matches = items.filter((i) => i.id === ref || i.id.endsWith(`/${ref}`));
  if (matches.length === 0) {
    danglingRefs++;
    console.error(`DANGLING REF: ${context} -> item "${ref}" does not exist`);
  } else if (matches.length > 1) {
    // Ambiguity is a latent bug: resolveItemRef returns the first match, so
    // which item a character actually gets depends on file/array ordering.
    danglingRefs++;
    console.error(`AMBIGUOUS REF: ${context} -> "${ref}" matches ${matches.length} items (${matches.map((m) => m.id).join(', ')})`);
  }
}

for (const entry of allEntries) {
  if (entry.kind === 'class') {
    for (const level of entry.data.levels) for (const ref of level.featureRefs) checkRef(ref, `${entry.id} level ${level.level}`);
  }
  if (entry.kind === 'subclass') {
    checkRef(entry.data.parentClassRef, `${entry.id}.parentClassRef`);
    for (const [level, refs] of Object.entries(entry.data.featuresByLevel)) for (const ref of refs) checkRef(ref, `${entry.id} level ${level}`);
    for (const [level, refs] of Object.entries(entry.data.grantedSpellsByLevel ?? {})) for (const ref of refs) checkRef(ref, `${entry.id} grantedSpells level ${level}`);
  }
  if (entry.kind === 'species') {
    for (const ref of entry.data.traits) checkRef(ref, `${entry.id}.traits`);
  }
  if (entry.kind === 'background') {
    if (entry.data.featureRef) checkRef(entry.data.featureRef, `${entry.id}.featureRef`);
    if (entry.data.grantedFeatRef) checkRef(entry.data.grantedFeatRef, `${entry.id}.grantedFeatRef`);
    for (const ref of entry.data.equipment) checkItemRef(ref, `${entry.id}.equipment`);
  }
  if (entry.kind === 'class' && entry.data.startingEquipment) {
    for (const ref of entry.data.startingEquipment.fixed) checkItemRef(ref, `${entry.id}.startingEquipment.fixed`);
    for (const choice of entry.data.startingEquipment.choices) {
      for (const option of choice.options) for (const ref of option) checkItemRef(ref, `${entry.id}.startingEquipment "${choice.prompt}"`);
    }
  }
}

// data/guidance/*.json — schema-parse + confirm every classRef/subclassRef it names actually exists.
for (const edition of EDITIONS) {
  const guidancePath = path.join(ROOT, 'data', 'guidance', `${edition}.json`);
  if (!existsSync(guidancePath)) continue;
  const raw = loadJson(guidancePath);
  for (const g of raw) {
    const result = ClassGuidanceSchema.safeParse(g);
    if (!result.success) {
      totalFailures++;
      console.error(`FAIL [guidance/${edition}] ${(g as { classRef?: string })?.classRef}:`, result.error.issues.slice(0, 3));
      continue;
    }
    checkRef(result.data.classRef, `guidance/${edition}.classRef`);
    for (const s of result.data.subclasses) checkRef(s.subclassRef, `guidance/${edition} subclass`);
  }
  console.log(`guidance/${edition}: ${raw.length} entries checked`);
}

console.log(`Referential integrity: ${danglingRefs === 0 ? 'OK' : `${danglingRefs} dangling ref(s)`}`);
console.log(`Id uniqueness: ${duplicateIds === 0 ? 'OK' : `${duplicateIds} duplicate id(s)`}`);

// --- Description coverage -------------------------------------------------
// `description` is optional on every payload that has one, so missing prose is
// never a schema failure. This is the ratchet instead: it reports coverage
// always, and only fails the run under --strict-descriptions. Flip that on in
// CI once coverage reaches 100%.
const strictDescriptions = process.argv.includes('--strict-descriptions');
const DESCRIBABLE_KINDS = ['class', 'subclass', 'species', 'background', 'spell', 'feat', 'feature', 'item'] as const;

console.log('\nDescription coverage:');
let missingDescriptions = 0;
const missingByKind: string[] = [];
for (const kind of DESCRIBABLE_KINDS) {
  const entries = allEntries.filter((e) => e.kind === kind);
  if (entries.length === 0) continue;
  const described = entries.filter((e) => {
    const description = (e.data as { description?: string }).description;
    return typeof description === 'string' && description.trim().length > 0;
  });
  const missing = entries.length - described.length;
  missingDescriptions += missing;
  const pct = Math.round((described.length / entries.length) * 100);
  console.log(`  ${kind.padEnd(10)} ${String(described.length).padStart(4)}/${String(entries.length).padEnd(4)} ${pct}%${missing > 0 ? `  (${missing} missing)` : ''}`);
  if (missing > 0) {
    for (const e of entries.filter((x) => !described.includes(x)).slice(0, 5)) missingByKind.push(`    ${e.id}`);
    if (missing > 5) missingByKind.push(`    ... +${missing - 5} more ${kind} entries`);
  }
}

if (missingDescriptions > 0 && strictDescriptions) {
  console.error(`\nMissing descriptions (--strict-descriptions):`);
  for (const line of missingByKind) console.error(line);
}

const strictFailure = strictDescriptions && missingDescriptions > 0;
if (totalFailures > 0 || danglingRefs > 0 || duplicateIds > 0 || strictFailure) {
  console.error(
    `\n${totalFailures} schema failure(s), ${danglingRefs} dangling ref(s), ${duplicateIds} duplicate id(s)` +
      `${strictFailure ? `, ${missingDescriptions} missing description(s)` : ''} out of ${totalEntries} entries.`,
  );
  process.exit(1);
}
console.log(`\nAll ${totalEntries} entries valid, no dangling refs, no duplicate ids.`);
