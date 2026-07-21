/**
 * Seeds data/2014/classes/*.json, species.json, backgrounds.json, feats.json
 * from the 5e-bits SRD API (https://www.dnd5eapi.co). Run with: pnpm seed:srd51:rules
 *
 * Scope note: SRD 5.1 only licenses 1 background (Acolyte) and 1 feat
 * (Grappler); real backgrounds/feats arrive via the Tasha's/PHB2024
 * extraction pipeline. Subclasses and subraces ARE seeded here — they're
 * free SRD content, just more API calls.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { type Ability, type ContentEntry, ContentEntrySchema } from '../../src/schema';

const API_ROOT = 'https://www.dnd5eapi.co';
const API_BASE = `${API_ROOT}/api/2014`;
const OUT_DIR = path.resolve(import.meta.dirname, '../../data/2014');
const CONCURRENCY = 12;

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`GET ${url} -> ${res.status}`);
  return res.json() as Promise<T>;
}

async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const i = cursor++;
      results[i] = await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

/** Flattens nested objects (e.g. monk's martial_arts: {dice_count, dice_value}) into scalar columns. */
function flattenColumns(obj: Record<string, unknown> | undefined, prefix = ''): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(obj ?? {})) {
    const flatKey = prefix ? `${prefix}_${key}` : key;
    if (value != null && typeof value === 'object' && !Array.isArray(value)) {
      Object.assign(out, flattenColumns(value as Record<string, unknown>, flatKey));
    } else if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      out[flatKey] = value;
    }
  }
  return out;
}

function toCamel(hyphenated: string): string {
  return hyphenated
    .split('-')
    .map((word, i) => (i === 0 ? word : word[0].toUpperCase() + word.slice(1)))
    .join('');
}

function apiSkillToOurSkill(index: string): string {
  return toCamel(index.replace(/^skill-/, ''));
}

/**
 * The API returns one flat `proficiencies` list mixing armor, weapons, tools,
 * AND saving throws. Defaulting the unmatched case to 'tool' (as this used to)
 * filed `saving-throw-str` and every named weapon like `longswords` as tool
 * proficiencies — which then rendered as "Saving Throw Str" under Tools on the
 * character sheet, and left Druid/Sorcerer with no weapon proficiencies at all.
 *
 * Saves are dropped: `savingThrowProficiencies` is populated from the API's
 * dedicated `saving_throws` field, so keeping them here is pure duplication.
 *
 * Anything not armor/save/tool-shaped is treated as a weapon, since the flat
 * list's remaining entries are all named weapons ("longswords", "hand-crossbows").
 * Musical instruments would classify wrongly here, but they reach classes via
 * `proficiency_choices`, not this list — revisit if that ever changes.
 */
function classifyProficiency(index: string): 'armor' | 'weapon' | 'tool' | 'save' {
  if (index.startsWith('saving-throw-')) return 'save';
  if (index.includes('armor') || index === 'shields') return 'armor';
  if (index.includes('weapon')) return 'weapon';
  if (/(-tools|-kit|-supplies|artisans|instrument)/.test(index)) return 'tool';
  return 'weapon';
}

interface FeatureRef {
  index: string;
  url: string;
}

async function fetchFeatureEntry(ref: FeatureRef, entryId: string): Promise<ContentEntry> {
  const detail = await fetchJson<{ name: string; desc: string[] }>(`${API_ROOT}${ref.url}`);
  return ContentEntrySchema.parse({
    id: entryId,
    edition: '2014',
    kind: 'feature',
    name: detail.name,
    source: { book: 'SRD5.1' },
    origin: 'seed',
    schemaVersion: 1,
    data: { description: (detail.desc ?? []).join('\n\n') },
  });
}

// ---------------------------------------------------------------------------
// Classes
// ---------------------------------------------------------------------------

const SPELLCASTING_META: Record<string, { progression: 'full' | 'half' | 'third' | 'pact'; knownOrPrepared: 'known' | 'prepared' }> = {
  bard: { progression: 'full', knownOrPrepared: 'known' },
  cleric: { progression: 'full', knownOrPrepared: 'prepared' },
  druid: { progression: 'full', knownOrPrepared: 'prepared' },
  paladin: { progression: 'half', knownOrPrepared: 'prepared' },
  ranger: { progression: 'half', knownOrPrepared: 'known' },
  sorcerer: { progression: 'full', knownOrPrepared: 'known' },
  warlock: { progression: 'pact', knownOrPrepared: 'known' },
  wizard: { progression: 'full', knownOrPrepared: 'prepared' },
};

interface ApiClassDetail {
  index: string;
  name: string;
  hit_die: number;
  proficiency_choices?: { choose: number; from: { options: { item: { index: string } }[] } }[];
  proficiencies: { index: string }[];
  saving_throws: { index: string }[];
  spellcasting?: { spellcasting_ability: { index: string } };
  subclasses: { index: string }[];
}

interface ApiSubclassDetail {
  index: string;
  name: string;
  desc: string[];
}

interface ApiSubclassLevel {
  level: number;
  features: FeatureRef[];
}

async function seedSubclass(classIndex: string, subclassIndex: string): Promise<ContentEntry[]> {
  const detail = await fetchJson<ApiSubclassDetail>(`${API_BASE}/subclasses/${subclassIndex}`);
  const levels = await fetchJson<ApiSubclassLevel[]>(`${API_BASE}/subclasses/${subclassIndex}/levels`);

  const featureRefs = new Map<string, FeatureRef>();
  for (const level of levels) for (const f of level.features) featureRefs.set(f.index, f);
  const featureEntries = await mapWithConcurrency([...featureRefs.values()], CONCURRENCY, (ref) =>
    fetchFeatureEntry(ref, classFeatureId(subclassIndex, ref.index)),
  );

  const featuresByLevel: Record<string, string[]> = {};
  for (const level of levels) {
    featuresByLevel[String(level.level)] = level.features.map((f) => classFeatureId(subclassIndex, f.index));
  }

  const subclassEntry = ContentEntrySchema.parse({
    id: `2014/subclass/${subclassIndex}`,
    edition: '2014',
    kind: 'subclass',
    name: detail.name,
    source: { book: 'SRD5.1' },
    origin: 'seed',
    schemaVersion: 1,
    data: {
      parentClassRef: `2014/class/${classIndex}`,
      description: detail.desc.join('\n\n') || undefined,
      featuresByLevel,
    },
  });

  return [subclassEntry, ...featureEntries];
}

interface ApiClassLevel {
  level: number;
  prof_bonus: number;
  features: FeatureRef[];
  class_specific?: Record<string, unknown>;
  spellcasting?: Record<string, number>;
}

/** Some API feature indexes already embed the class name (e.g. "barbarian-unarmored-defense"); avoid double-prefixing those. */
function classFeatureId(classIndex: string, featureIndex: string): string {
  const key = featureIndex.startsWith(`${classIndex}-`) ? featureIndex : `${classIndex}-${featureIndex}`;
  return `2014/feature/${key}`;
}

async function seedClass(classIndex: string): Promise<ContentEntry[]> {
  const detail = await fetchJson<ApiClassDetail>(`${API_BASE}/classes/${classIndex}`);
  const levels = await fetchJson<ApiClassLevel[]>(`${API_BASE}/classes/${classIndex}/levels`);

  const armorProfs: string[] = [];
  const weaponProfs: string[] = [];
  const toolProfs: string[] = [];
  for (const p of detail.proficiencies) {
    const bucket = classifyProficiency(p.index);
    if (bucket === 'save') continue; // already covered by savingThrowProficiencies
    (bucket === 'armor' ? armorProfs : bucket === 'weapon' ? weaponProfs : toolProfs).push(p.index);
  }

  const skillChoice = detail.proficiency_choices?.find((pc) => pc.from.options.every((o) => o.item.index.startsWith('skill-')));

  // Collect every feature this class references across all 20 levels, deduped.
  const featureRefs = new Map<string, FeatureRef>();
  for (const level of levels) {
    for (const f of level.features) featureRefs.set(f.index, f);
  }
  const featureEntries = await mapWithConcurrency([...featureRefs.values()], CONCURRENCY, (ref) =>
    fetchFeatureEntry(ref, classFeatureId(classIndex, ref.index)),
  );

  const spellMeta = SPELLCASTING_META[classIndex];

  const classEntry = ContentEntrySchema.parse({
    id: `2014/class/${classIndex}`,
    edition: '2014',
    kind: 'class',
    name: detail.name,
    source: { book: 'SRD5.1' },
    origin: 'seed',
    schemaVersion: 1,
    data: {
      hitDie: `d${detail.hit_die}`,
      savingThrowProficiencies: detail.saving_throws.map((s) => s.index as Ability),
      armorProficiencies: armorProfs,
      weaponProficiencies: weaponProfs,
      toolProficiencies: toolProfs.length > 0 ? toolProfs : undefined,
      skillChoice: skillChoice
        ? { count: skillChoice.choose, options: skillChoice.from.options.map((o) => apiSkillToOurSkill(o.item.index)) }
        : undefined,
      spellcasting:
        spellMeta && detail.spellcasting
          ? { progression: spellMeta.progression, ability: detail.spellcasting.spellcasting_ability.index as Ability, knownOrPrepared: spellMeta.knownOrPrepared }
          : undefined,
      levels: levels.map((level) => ({
        level: level.level,
        proficiencyBonus: level.prof_bonus,
        featureRefs: level.features.map((f) => classFeatureId(classIndex, f.index)),
        columns: { ...flattenColumns(level.class_specific), ...flattenColumns(level.spellcasting) },
      })),
    },
  });

  const subclassEntries = (
    await mapWithConcurrency(detail.subclasses ?? [], CONCURRENCY, (sc) => seedSubclass(classIndex, sc.index))
  ).flat();

  return [classEntry, ...featureEntries, ...subclassEntries];
}

async function seedClasses(): Promise<ContentEntry[]> {
  const list = await fetchJson<{ results: { index: string }[] }>(`${API_BASE}/classes`);
  const all: ContentEntry[] = [];
  for (const c of list.results) {
    console.log(`Seeding class ${c.index}...`);
    const entries = await seedClass(c.index);
    all.push(...entries);
    mkdirSync(path.join(OUT_DIR, 'classes'), { recursive: true });
    writeFileSync(path.join(OUT_DIR, 'classes', `${c.index}.json`), JSON.stringify(entries, null, 2));
  }
  return all;
}

// ---------------------------------------------------------------------------
// Species (races)
// ---------------------------------------------------------------------------

interface ApiRace {
  index: string;
  name: string;
  speed: number;
  size: string;
  traits: FeatureRef[];
  ability_bonuses: { ability_score: { index: string }; bonus: number }[];
  subraces: { index: string }[];
}

interface ApiSubrace {
  index: string;
  name: string;
  race: { index: string };
  ability_bonuses: { ability_score: { index: string }; bonus: number }[];
  racial_traits: FeatureRef[];
}

async function seedSpecies(): Promise<ContentEntry[]> {
  const list = await fetchJson<{ results: { index: string }[] }>(`${API_BASE}/races`);
  console.log(`Seeding ${list.results.length} species...`);
  const races = await mapWithConcurrency(list.results, CONCURRENCY, (ref) => fetchJson<ApiRace>(`${API_BASE}/races/${ref.index}`));

  const subraceRefs = races.flatMap((race) => race.subraces);
  const subraces = await mapWithConcurrency(subraceRefs, CONCURRENCY, (ref) =>
    fetchJson<ApiSubrace>(`${API_BASE}/subraces/${ref.index}`),
  );

  // Traits are shared across races (e.g. Darkvision) — dedupe by trait index.
  const traitRefs = new Map<string, FeatureRef>();
  for (const race of races) for (const t of race.traits) traitRefs.set(t.index, t);
  for (const subrace of subraces) for (const t of subrace.racial_traits) traitRefs.set(t.index, t);
  const traitEntries = await mapWithConcurrency([...traitRefs.values()], CONCURRENCY, (ref) =>
    fetchFeatureEntry(ref, `2014/feature/trait-${ref.index}`),
  );

  const speciesEntries = races.map((race) =>
    ContentEntrySchema.parse({
      id: `2014/species/${race.index}`,
      edition: '2014',
      kind: 'species',
      name: race.name,
      source: { book: 'SRD5.1' },
      origin: 'seed',
      schemaVersion: 1,
      data: {
        size: race.size.toLowerCase(),
        speed: race.speed,
        traits: race.traits.map((t) => `2014/feature/trait-${t.index}`),
      },
      effects: race.ability_bonuses.map((b) => ({
        op: 'abilityBonus' as const,
        ability: b.ability_score.index as Ability,
        amount: String(b.bonus),
      })),
    }),
  );

  // Subraces are seeded as full standalone species entries (parent race's size/speed/traits
  // folded in) so the builder can offer "High Elf" directly rather than a two-step pick.
  const racesById = new Map(races.map((r) => [r.index, r]));
  const subraceEntries = subraces.map((subrace) => {
    const parent = racesById.get(subrace.race.index)!;
    return ContentEntrySchema.parse({
      id: `2014/species/${subrace.index}`,
      edition: '2014',
      kind: 'species',
      name: subrace.name,
      source: { book: 'SRD5.1' },
      origin: 'seed',
      schemaVersion: 1,
      data: {
        size: parent.size.toLowerCase(),
        speed: parent.speed,
        traits: [
          ...parent.traits.map((t) => `2014/feature/trait-${t.index}`),
          ...subrace.racial_traits.map((t) => `2014/feature/trait-${t.index}`),
        ],
        parentSpeciesRef: `2014/species/${parent.index}`,
      },
      effects: [...parent.ability_bonuses, ...subrace.ability_bonuses].map((b) => ({
        op: 'abilityBonus' as const,
        ability: b.ability_score.index as Ability,
        amount: String(b.bonus),
      })),
    });
  });

  return [...speciesEntries, ...subraceEntries, ...traitEntries];
}

// ---------------------------------------------------------------------------
// Backgrounds
// ---------------------------------------------------------------------------

interface ApiBackground {
  index: string;
  name: string;
  starting_proficiencies: { index: string }[];
  starting_equipment: { equipment: { index: string }; quantity: number }[];
  feature: { name: string; desc: string[] };
}

async function seedBackgrounds(): Promise<ContentEntry[]> {
  const list = await fetchJson<{ results: { index: string }[] }>(`${API_BASE}/backgrounds`);
  console.log(`Seeding ${list.results.length} backgrounds...`);
  const backgrounds = await mapWithConcurrency(list.results, CONCURRENCY, (ref) => fetchJson<ApiBackground>(`${API_BASE}/backgrounds/${ref.index}`));

  const entries: ContentEntry[] = [];
  for (const bg of backgrounds) {
    const featureId = `2014/feature/background-${bg.index}`;
    entries.push(
      ContentEntrySchema.parse({
        id: featureId,
        edition: '2014',
        kind: 'feature',
        name: bg.feature.name,
        source: { book: 'SRD5.1' },
        origin: 'seed',
        schemaVersion: 1,
        data: { description: bg.feature.desc.join('\n\n') },
      }),
    );
    entries.push(
      ContentEntrySchema.parse({
        id: `2014/background/${bg.index}`,
        edition: '2014',
        kind: 'background',
        name: bg.name,
        source: { book: 'SRD5.1' },
        origin: 'seed',
        schemaVersion: 1,
        data: {
          skillProficiencies: bg.starting_proficiencies
            .filter((p) => p.index.startsWith('skill-'))
            .map((p) => apiSkillToOurSkill(p.index)),
          toolProficiencies: bg.starting_proficiencies
            .filter((p) => !p.index.startsWith('skill-'))
            .map((p) => p.index),
          equipment: bg.starting_equipment.map((e) => e.equipment.index),
          featureRef: featureId,
        },
      }),
    );
  }
  return entries;
}

// ---------------------------------------------------------------------------
// Feats
// ---------------------------------------------------------------------------

interface ApiFeat {
  index: string;
  name: string;
  prerequisites: { ability_score?: { index: string }; minimum_score?: number }[];
  desc: string[];
}

function describePrerequisite(p: ApiFeat['prerequisites'][number]): string {
  if (p.ability_score && p.minimum_score != null) {
    return `${p.ability_score.index.toUpperCase()} ${p.minimum_score}+`;
  }
  return '';
}

async function seedFeats(): Promise<ContentEntry[]> {
  const list = await fetchJson<{ results: { index: string }[] }>(`${API_BASE}/feats`);
  console.log(`Seeding ${list.results.length} feats...`);
  const feats = await mapWithConcurrency(list.results, CONCURRENCY, (ref) => fetchJson<ApiFeat>(`${API_BASE}/feats/${ref.index}`));

  return feats.map((feat) =>
    ContentEntrySchema.parse({
      id: `2014/feat/${feat.index}`,
      edition: '2014',
      kind: 'feat',
      name: feat.name,
      source: { book: 'SRD5.1' },
      origin: 'seed',
      schemaVersion: 1,
      data: {
        prerequisite: feat.prerequisites.map(describePrerequisite).filter(Boolean).join(', ') || undefined,
        description: feat.desc.join('\n\n'),
      },
    }),
  );
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });

  await seedClasses();

  const species = await seedSpecies();
  writeFileSync(path.join(OUT_DIR, 'species.json'), JSON.stringify(species, null, 2));
  console.log(`Wrote ${species.length} species entries to data/2014/species.json`);

  const backgrounds = await seedBackgrounds();
  writeFileSync(path.join(OUT_DIR, 'backgrounds.json'), JSON.stringify(backgrounds, null, 2));
  console.log(`Wrote ${backgrounds.length} background entries to data/2014/backgrounds.json`);

  const feats = await seedFeats();
  writeFileSync(path.join(OUT_DIR, 'feats.json'), JSON.stringify(feats, null, 2));
  console.log(`Wrote ${feats.length} feats to data/2014/feats.json`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
