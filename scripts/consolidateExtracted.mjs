#!/usr/bin/env node
/**
 * One-time migration: folds data/<edition>/extracted.json into the committed
 * per-kind data files, so all content lives in one source instead of a
 * seed/extracted split.
 *
 * Routing follows the convention the existing files already use — a feature
 * lives co-located with whatever references it:
 *   spell/item/feat/species -> the matching per-kind file
 *   class                   -> classes/<class>.json (new file)
 *   subclass                -> classes/<parent class>.json
 *   feature                 -> the file of the class/subclass/species/background
 *                              that references it; unreferenced ones go to the
 *                              new features.json bucket
 *
 * Moved entries are rewritten to origin:'seed' — they now ship with the build
 * exactly like the rest of the committed content. `OriginSchema` deliberately
 * keeps 'extracted' as a value (pack-imported Dexie rows still carry it).
 *
 * Idempotent: exits cleanly if extracted.json is already gone.
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const EDITIONS = ['2014', '2024'];

const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const writeJson = (p, v) => {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(v, null, 2) + '\n');
};
const classFileFor = (dir, classRef) => path.join(dir, 'classes', `${classRef.split('/').pop()}.json`);

let movedTotal = 0;

for (const edition of EDITIONS) {
  const dir = path.join(ROOT, 'data', edition);
  const extractedPath = path.join(dir, 'extracted.json');
  if (!fs.existsSync(extractedPath)) {
    console.log(`${edition}: no extracted.json — already consolidated, skipping`);
    continue;
  }

  const extracted = readJson(extractedPath);
  if (extracted.length === 0) {
    fs.unlinkSync(extractedPath);
    console.log(`${edition}: extracted.json was empty — removed`);
    continue;
  }

  // Every entry in the edition, so features can be routed to their referrer
  // (the referrer may itself live in extracted.json, e.g. Artificer subclasses).
  const existingFiles = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.json') && f !== 'extracted.json')
    .map((f) => path.join(dir, f));
  const classesDir = path.join(dir, 'classes');
  if (fs.existsSync(classesDir)) for (const f of fs.readdirSync(classesDir)) existingFiles.push(path.join(classesDir, f));

  const fileOf = new Map(); // entry id -> absolute file path it currently lives in
  const allEntries = [];
  for (const file of existingFiles) {
    for (const entry of readJson(file)) {
      fileOf.set(entry.id, file);
      allEntries.push(entry);
    }
  }
  for (const entry of extracted) allEntries.push(entry);

  // featureRef -> the entry that references it. Class/subclass refs win over
  // species/background so a feature shared across kinds lands with its class.
  const referrerOf = new Map();
  const claim = (ref, referrer, strong) => {
    if (!referrerOf.has(ref) || (strong && !referrerOf.get(ref).strong)) referrerOf.set(ref, { referrer, strong });
  };
  for (const e of allEntries) {
    const d = e.data ?? {};
    if (e.kind === 'class') for (const l of d.levels ?? []) for (const r of l.featureRefs ?? []) claim(r, e, true);
    if (e.kind === 'subclass') for (const refs of Object.values(d.featuresByLevel ?? {})) for (const r of refs) claim(r, e, true);
    if (e.kind === 'species') for (const r of d.traits ?? []) claim(r, e, false);
    if (e.kind === 'background' && d.featureRef) claim(d.featureRef, e, false);
  }

  /** Resolves the destination file for one extracted entry. */
  function destinationFor(entry) {
    switch (entry.kind) {
      case 'spell':
        return path.join(dir, 'spells.json');
      case 'item':
        return path.join(dir, 'items.json');
      case 'feat':
        return path.join(dir, 'feats.json');
      case 'species':
        return path.join(dir, 'species.json');
      case 'background':
        return path.join(dir, 'backgrounds.json');
      case 'class':
        return classFileFor(dir, entry.id);
      case 'subclass':
        return classFileFor(dir, entry.data.parentClassRef);
      case 'feature': {
        const ref = referrerOf.get(entry.id);
        if (!ref) return path.join(dir, 'features.json'); // orphan — browsable, unreferenced
        const { referrer } = ref;
        if (referrer.kind === 'class') return classFileFor(dir, referrer.id);
        if (referrer.kind === 'subclass') return classFileFor(dir, referrer.data.parentClassRef);
        if (referrer.kind === 'species') return path.join(dir, 'species.json');
        if (referrer.kind === 'background') return path.join(dir, 'backgrounds.json');
        return path.join(dir, 'features.json');
      }
      default:
        throw new Error(`unhandled kind "${entry.kind}" for ${entry.id}`);
    }
  }

  const additions = new Map(); // destination file -> entries to append
  for (const entry of extracted) {
    if (fileOf.has(entry.id)) throw new Error(`id collision: ${entry.id} already exists in ${fileOf.get(entry.id)}`);
    const dest = destinationFor(entry);
    if (!additions.has(dest)) additions.set(dest, []);
    additions.get(dest).push({ ...entry, origin: 'seed' });
  }

  for (const [dest, entries] of [...additions].sort()) {
    const current = fs.existsSync(dest) ? readJson(dest) : [];
    writeJson(dest, [...current, ...entries]);
    console.log(`  ${path.relative(ROOT, dest)}  +${entries.length}`);
  }

  // features.json must exist even when empty — loader.ts imports it unconditionally.
  const featuresPath = path.join(dir, 'features.json');
  if (!fs.existsSync(featuresPath)) writeJson(featuresPath, []);

  fs.unlinkSync(extractedPath);
  movedTotal += extracted.length;
  console.log(`${edition}: moved ${extracted.length} entries, removed extracted.json\n`);
}

console.log(`Done — ${movedTotal} entries consolidated.`);
