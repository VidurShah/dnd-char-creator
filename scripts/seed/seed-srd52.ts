/**
 * Seeds data/2024/* from the 5e-bits SRD API (https://www.dnd5eapi.co/api/2024),
 * which serves the freely-licensed SRD 5.2 (2024 rules) content. Run with:
 * pnpm seed:srd52
 *
 * API gap note: /api/2024/classes/{id}/levels 404s across every class (seemingly
 * unimplemented upstream, unlike the working 2014 equivalent). Since the numeric
 * per-level progressions that endpoint would give us — spell slots, cantrips
 * known, resource counts like rage/ki — are RULES-IDENTICAL between 2014 and
 * 2024 (the revision didn't touch those tables), we reuse the already-seeded
 * data/2014/classes/<id>.json columns for those numbers, and source featureRefs
 * instead from the (working) /api/2024/features listing, which conveniently
 * tags each feature with its class and level individually.
 *
 * Spells: 2024 has no working spell list/detail endpoints at all yet. We reuse
 * the seeded 2014 SRD 5.1 spell list (retagged 2024/SRD5.2) since the two
 * spell pools overlap heavily — a handful of 2024-only renames/tweaks will
 * only show up once the Tasha's/PHB2024 extraction pipeline runs on the real
 * books.
 *
 * Also NOT seeded: subraces don't exist in 2024 (species dropped them), and
 * species no longer grant ability score bonuses at all — that's a genuine
 * 2024 rules change, not a gap. Backgrounds grant the ability score increase
 * and a starting Origin feat instead (see BackgroundPayloadSchema).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { type Ability, type ContentEntry, type Skill, ContentEntrySchema } from '../../src/schema';

const API_ROOT = 'https://www.dnd5eapi.co';
const API_BASE = `${API_ROOT}/api/2024`;
const OUT_DIR = path.resolve(import.meta.dirname, '../../data/2024');
const LEGACY_2014_DIR = path.resolve(import.meta.dirname, '../../data/2014');
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

function toCamel(hyphenated: string): string {
  return hyphenated.split('-').map((w, i) => (i === 0 ? w : w[0].toUpperCase() + w.slice(1))).join('');
}

function apiSkillToOurSkill(index: string): Skill {
  return toCamel(index.replace(/^skill-/, '')) as Skill;
}

function classifyProficiency(index: string): 'armor' | 'weapon' | 'tool' | 'skip' {
  if (index.startsWith('saving-throw')) return 'skip'; // 2024 lists saves redundantly inside `proficiencies` too
  if (index.includes('armor') || index === 'shields') return 'armor';
  if (index.includes('weapon')) return 'weapon';
  return 'tool';
}

// ---------------------------------------------------------------------------
// Class-level 2014 numeric columns (spell slots, cantrips, resources) — reused
// since those tables didn't change in the 2024 revision. See file header.
// ---------------------------------------------------------------------------

function load2014ClassColumns(classIndex: string): Map<number, Record<string, string | number | boolean>> {
  const filePath = path.join(LEGACY_2014_DIR, 'classes', `${classIndex}.json`);
  if (!existsSync(filePath)) return new Map();
  const entries = JSON.parse(readFileSync(filePath, 'utf-8')) as ContentEntry[];
  const classEntry = entries.find((e) => e.kind === 'class');
  if (classEntry?.kind !== 'class') return new Map();
  return new Map(classEntry.data.levels.map((l) => [l.level, l.columns ?? {}]));
}

// ---------------------------------------------------------------------------
// Features (class-tagged; 2024's /features listing tags each with class+level)
// ---------------------------------------------------------------------------

interface ApiFeatureRef {
  index: string;
  url: string;
}

interface ApiFeatureDetail {
  name: string;
  description: string;
  class?: { index: string };
  level?: { index: string }; // e.g. "barbarian-2"
}

async function fetchAllFeatures(): Promise<ApiFeatureDetail[]> {
  const list = await fetchJson<{ results: ApiFeatureRef[] }>(`${API_BASE}/features`);
  console.log(`Fetching ${list.results.length} features...`);
  return mapWithConcurrency(list.results, CONCURRENCY, (ref) => fetchJson<ApiFeatureDetail>(`${API_ROOT}${ref.url}`));
}

function featureLevelNumber(feature: ApiFeatureDetail): number | undefined {
  const match = /-(\d+)$/.exec(feature.level?.index ?? '');
  return match ? Number(match[1]) : undefined;
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

interface ApiSubclassFeature {
  name: string;
  level: number;
  description: string;
}

interface ApiSubclassDetail {
  index: string;
  name: string;
  description: string;
  class: { index: string };
  features: ApiSubclassFeature[];
}

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

function mapSubclass(detail: ApiSubclassDetail): ContentEntry[] {
  const featureEntries: ContentEntry[] = detail.features.map((f) =>
    ContentEntrySchema.parse({
      id: `2024/feature/${detail.index}-${slugify(f.name)}`,
      edition: '2024',
      kind: 'feature',
      name: f.name,
      source: { book: 'PHB2024' },
      origin: 'seed',
      schemaVersion: 1,
      data: { description: f.description },
    }),
  );

  const featuresByLevel: Record<string, string[]> = {};
  for (const f of detail.features) {
    const key = String(f.level);
    (featuresByLevel[key] ??= []).push(`2024/feature/${detail.index}-${slugify(f.name)}`);
  }

  const subclassEntry = ContentEntrySchema.parse({
    id: `2024/subclass/${detail.index}`,
    edition: '2024',
    kind: 'subclass',
    name: detail.name,
    source: { book: 'PHB2024' },
    origin: 'seed',
    schemaVersion: 1,
    data: { parentClassRef: `2024/class/${detail.class.index}`, description: detail.description, featuresByLevel },
  });

  return [subclassEntry, ...featureEntries];
}

async function seedClass(classIndex: string, featuresByClass: Map<string, ApiFeatureDetail[]>): Promise<ContentEntry[]> {
  const detail = await fetchJson<ApiClassDetail>(`${API_BASE}/classes/${classIndex}`);
  const legacyColumns = load2014ClassColumns(classIndex);

  const armorProfs: string[] = [];
  const weaponProfs: string[] = [];
  const toolProfs: string[] = [];
  for (const p of detail.proficiencies) {
    const bucket = classifyProficiency(p.index);
    if (bucket === 'skip') continue;
    (bucket === 'armor' ? armorProfs : bucket === 'weapon' ? weaponProfs : toolProfs).push(p.index);
  }

  const skillChoice = detail.proficiency_choices?.find((pc) => pc.from.options.every((o) => o.item.index.startsWith('skill-')));

  const classFeatures = featuresByClass.get(classIndex) ?? [];
  const featureEntries = classFeatures.map((f) =>
    ContentEntrySchema.parse({
      id: `2024/feature/${classIndex}-${slugify(f.name)}`,
      edition: '2024',
      kind: 'feature',
      name: f.name,
      source: { book: 'PHB2024' },
      origin: 'seed',
      schemaVersion: 1,
      data: { description: f.description },
    }),
  );
  const featureRefsByLevel = new Map<number, string[]>();
  for (const f of classFeatures) {
    const level = featureLevelNumber(f);
    if (level == null) continue;
    const refs = featureRefsByLevel.get(level) ?? [];
    refs.push(`2024/feature/${classIndex}-${slugify(f.name)}`);
    featureRefsByLevel.set(level, refs);
  }

  const spellMeta = SPELLCASTING_META[classIndex];

  const levels = Array.from({ length: 20 }, (_, i) => {
    const level = i + 1;
    return {
      level,
      proficiencyBonus: 2 + Math.floor((level - 1) / 4),
      featureRefs: featureRefsByLevel.get(level) ?? [],
      columns: legacyColumns.get(level) ?? {},
    };
  });

  const classEntry = ContentEntrySchema.parse({
    id: `2024/class/${classIndex}`,
    edition: '2024',
    kind: 'class',
    name: detail.name,
    source: { book: 'PHB2024' },
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
      levels,
    },
  });

  const subclassDetails = await mapWithConcurrency(detail.subclasses ?? [], CONCURRENCY, (sc) =>
    fetchJson<ApiSubclassDetail>(`${API_BASE}/subclasses/${sc.index}`),
  );
  const subclassEntries = subclassDetails.flatMap(mapSubclass);

  return [classEntry, ...featureEntries, ...subclassEntries];
}

async function seedClasses(): Promise<ContentEntry[]> {
  const allFeatures = await fetchAllFeatures();
  const featuresByClass = new Map<string, ApiFeatureDetail[]>();
  for (const f of allFeatures) {
    if (!f.class) continue;
    const arr = featuresByClass.get(f.class.index) ?? [];
    arr.push(f);
    featuresByClass.set(f.class.index, arr);
  }

  const list = await fetchJson<{ results: { index: string }[] }>(`${API_BASE}/classes`);
  const all: ContentEntry[] = [];
  for (const c of list.results) {
    console.log(`Seeding class ${c.index}...`);
    const entries = await seedClass(c.index, featuresByClass);
    all.push(...entries);
    mkdirSync(path.join(OUT_DIR, 'classes'), { recursive: true });
    writeFileSync(path.join(OUT_DIR, 'classes', `${c.index}.json`), JSON.stringify(entries, null, 2));
  }
  return all;
}

// ---------------------------------------------------------------------------
// Species (no subraces, no ability bonuses in 2024)
// ---------------------------------------------------------------------------

interface ApiTraitRef {
  index: string;
  url: string;
}

interface ApiSpecies {
  index: string;
  name: string;
  size: string | null;
  speed: number;
  traits: ApiTraitRef[];
}

async function fetchTraitEntry(ref: ApiTraitRef): Promise<ContentEntry> {
  const detail = await fetchJson<{ name: string; description?: string; desc?: string[] }>(`${API_ROOT}${ref.url}`);
  const description = detail.description ?? (detail.desc ?? []).join('\n\n');
  return ContentEntrySchema.parse({
    id: `2024/feature/trait-${ref.index}`,
    edition: '2024',
    kind: 'feature',
    name: detail.name,
    source: { book: 'PHB2024' },
    origin: 'seed',
    schemaVersion: 1,
    data: { description },
  });
}

async function seedSpecies(): Promise<ContentEntry[]> {
  const list = await fetchJson<{ results: { index: string }[] }>(`${API_BASE}/species`);
  console.log(`Seeding ${list.results.length} species...`);
  const species = await mapWithConcurrency(list.results, CONCURRENCY, (ref) => fetchJson<ApiSpecies>(`${API_BASE}/species/${ref.index}`));

  const traitRefs = new Map<string, ApiTraitRef>();
  for (const s of species) for (const t of s.traits) traitRefs.set(t.index, t);
  const traitEntries = await mapWithConcurrency([...traitRefs.values()], CONCURRENCY, fetchTraitEntry);

  const speciesEntries = species.map((s) =>
    ContentEntrySchema.parse({
      id: `2024/species/${s.index}`,
      edition: '2024',
      kind: 'species',
      name: s.name,
      source: { book: 'PHB2024' },
      origin: 'seed',
      schemaVersion: 1,
      data: { size: (s.size ?? 'Medium').toLowerCase(), speed: s.speed, traits: s.traits.map((t) => `2024/feature/trait-${t.index}`) },
    }),
  );

  return [...speciesEntries, ...traitEntries];
}

// ---------------------------------------------------------------------------
// Backgrounds (grant ability score choice + an Origin feat directly)
// ---------------------------------------------------------------------------

interface ApiBackground {
  index: string;
  name: string;
  ability_scores: { index: string }[];
  feat: { index: string };
  proficiencies: { index: string }[];
}

async function seedBackgrounds(): Promise<ContentEntry[]> {
  const list = await fetchJson<{ results: { index: string }[] }>(`${API_BASE}/backgrounds`);
  console.log(`Seeding ${list.results.length} backgrounds...`);
  const backgrounds = await mapWithConcurrency(list.results, CONCURRENCY, (ref) => fetchJson<ApiBackground>(`${API_BASE}/backgrounds/${ref.index}`));

  return backgrounds.map((bg) =>
    ContentEntrySchema.parse({
      id: `2024/background/${bg.index}`,
      edition: '2024',
      kind: 'background',
      name: bg.name,
      source: { book: 'PHB2024' },
      origin: 'seed',
      schemaVersion: 1,
      data: {
        skillProficiencies: bg.proficiencies.filter((p) => p.index.startsWith('skill-')).map((p) => apiSkillToOurSkill(p.index)),
        toolProficiencies: bg.proficiencies.filter((p) => !p.index.startsWith('skill-')).map((p) => p.index),
        equipment: [],
        abilityScoreOptions: bg.ability_scores.map((a) => a.index as Ability),
        grantedFeatRef: `2024/feat/${bg.feat.index}`,
      },
    }),
  );
}

// ---------------------------------------------------------------------------
// Feats
// ---------------------------------------------------------------------------

interface ApiFeat {
  index: string;
  name: string;
  description: string;
  prerequisites?: { minimum_level?: number };
  prerequisite_options?: { desc: string };
}

function describeFeatPrerequisite(f: ApiFeat): string | undefined {
  const parts: string[] = [];
  if (f.prerequisites?.minimum_level) parts.push(`Level ${f.prerequisites.minimum_level}+`);
  if (f.prerequisite_options?.desc) parts.push(f.prerequisite_options.desc);
  return parts.length > 0 ? parts.join(', ') : undefined;
}

async function seedFeats(): Promise<ContentEntry[]> {
  const list = await fetchJson<{ results: { index: string }[] }>(`${API_BASE}/feats`);
  console.log(`Seeding ${list.results.length} feats...`);
  const feats = await mapWithConcurrency(list.results, CONCURRENCY, (ref) => fetchJson<ApiFeat>(`${API_BASE}/feats/${ref.index}`));

  return feats.map((feat) =>
    ContentEntrySchema.parse({
      id: `2024/feat/${feat.index}`,
      edition: '2024',
      kind: 'feat',
      name: feat.name,
      source: { book: 'PHB2024' },
      origin: 'seed',
      schemaVersion: 1,
      data: { prerequisite: describeFeatPrerequisite(feat), description: feat.description },
    }),
  );
}

// ---------------------------------------------------------------------------
// Equipment + magic items
// ---------------------------------------------------------------------------

interface ApiEquipment2024 {
  index: string;
  name: string;
  description?: string[];
  equipment_categories: { index: string }[];
  cost?: { quantity: number; unit: string };
  weight?: number;
  damage?: { damage_dice: string; damage_type: { index: string } };
  two_handed_damage?: { damage_dice: string };
  range?: { normal: number; long?: number };
  properties?: { index: string }[];
  mastery?: { index: string; name: string };
  armor_class?: { base: number; dex_bonus: boolean; max_bonus?: number };
  str_minimum?: number;
  stealth_disadvantage?: boolean;
}

function mapCategory2024(categories: string[]): 'weapon' | 'armor' | 'shield' | 'tool' | 'ammunition' | 'adventuringGear' {
  if (categories.includes('weapons')) return 'weapon';
  if (categories.some((c) => c === 'shield' || c === 'shields')) return 'shield';
  if (categories.includes('armor')) return 'armor';
  if (categories.includes('ammunition')) return 'ammunition';
  if (categories.some((c) => c.includes('tool') || c.includes('instrument') || c.includes('kit') || c.includes('gaming-set'))) return 'tool';
  return 'adventuringGear';
}

function mapCurrency(unit: string): 'cp' | 'sp' | 'ep' | 'gp' | 'pp' {
  return (['cp', 'sp', 'ep', 'gp', 'pp'] as const).includes(unit as 'cp') ? (unit as 'cp' | 'sp' | 'ep' | 'gp' | 'pp') : 'gp';
}

function mapEquipment2024(e: ApiEquipment2024): ContentEntry {
  const categoryIds = e.equipment_categories.map((c) => c.index);
  const category = mapCategory2024(categoryIds);

  return ContentEntrySchema.parse({
    id: `2024/item/${e.index}`,
    edition: '2024',
    kind: 'item',
    name: e.name,
    source: { book: 'PHB2024' },
    origin: 'seed',
    schemaVersion: 1,
    data: {
      category,
      rarity: 'mundane',
      cost: e.cost ? { amount: e.cost.quantity, currency: mapCurrency(e.cost.unit) } : undefined,
      weight: e.weight,
      attunement: false,
      description: (e.description ?? []).join('\n\n'),
      weapon:
        category === 'weapon' && e.damage
          ? {
              damageDice: e.damage.damage_dice,
              damageType: e.damage.damage_type.index,
              properties: (e.properties ?? []).map((p) => p.index),
              mastery: e.mastery?.name,
              versatileDamageDice: e.two_handed_damage?.damage_dice,
              range: e.range ? { normal: e.range.normal, long: e.range.long ?? e.range.normal } : undefined,
            }
          : undefined,
      armor:
        (category === 'armor' || category === 'shield') && e.armor_class
          ? {
              baseAc: e.armor_class.base,
              addDexMod: e.armor_class.dex_bonus,
              maxDexBonus: e.armor_class.max_bonus,
              strengthRequirement: e.str_minimum || undefined,
              stealthDisadvantage: e.stealth_disadvantage ?? false,
            }
          : undefined,
    },
  });
}

async function seedEquipment(): Promise<ContentEntry[]> {
  const list = await fetchJson<{ results: { index: string }[] }>(`${API_BASE}/equipment`);
  console.log(`Fetching ${list.results.length} equipment items...`);
  const items = await mapWithConcurrency(list.results, CONCURRENCY, (ref) => fetchJson<ApiEquipment2024>(`${API_BASE}/equipment/${ref.index}`));
  return items.map(mapEquipment2024);
}

interface ApiMagicItem2024 {
  index: string;
  name: string;
  description?: string[];
  rarity: { name: string };
  variants?: { index: string }[];
}

function mapRarity(name: string): 'mundane' | 'common' | 'uncommon' | 'rare' | 'veryRare' | 'legendary' | 'artifact' {
  const normalized = name.toLowerCase();
  if (normalized.includes('very rare')) return 'veryRare';
  if (normalized.includes('uncommon')) return 'uncommon';
  if (normalized.includes('common')) return 'common';
  if (normalized.includes('legendary')) return 'legendary';
  if (normalized.includes('artifact')) return 'artifact';
  if (normalized.includes('rare')) return 'rare';
  return 'common';
}

const KNOWN_ITEM_EFFECTS: Record<string, ContentEntry['effects']> = {
  'ring-of-protection': [
    { op: 'acBonus', amount: '1' },
    { op: 'rollBonus', on: ['savingThrow'], amount: '1' },
  ],
  'cloak-of-protection': [
    { op: 'acBonus', amount: '1' },
    { op: 'rollBonus', on: ['savingThrow'], amount: '1' },
  ],
};

function mapMagicItem2024(m: ApiMagicItem2024): ContentEntry | null {
  if ((m.variants?.length ?? 0) > 0 && (m.description?.length ?? 0) === 0) return null;
  const description = (m.description ?? []).join('\n\n');

  return ContentEntrySchema.parse({
    id: `2024/item/${m.index}`,
    edition: '2024',
    kind: 'item',
    name: m.name,
    source: { book: 'PHB2024' },
    origin: 'seed',
    schemaVersion: 1,
    effects: KNOWN_ITEM_EFFECTS[m.index],
    data: {
      category: 'wondrousItem',
      rarity: mapRarity(m.rarity.name),
      attunement: /requires attunement/i.test(description),
      description,
    },
  });
}

async function seedMagicItems(): Promise<ContentEntry[]> {
  const list = await fetchJson<{ results: { index: string }[] }>(`${API_BASE}/magic-items`);
  console.log(`Fetching ${list.results.length} magic items...`);
  const items = await mapWithConcurrency(list.results, CONCURRENCY, (ref) => fetchJson<ApiMagicItem2024>(`${API_BASE}/magic-items/${ref.index}`));
  return items.map(mapMagicItem2024).filter((e): e is ContentEntry => e !== null);
}

// ---------------------------------------------------------------------------
// Spells (reused from 2014 — see file header)
// ---------------------------------------------------------------------------

function reuse2014Spells(): ContentEntry[] {
  const filePath = path.join(LEGACY_2014_DIR, 'spells.json');
  const spells2014 = JSON.parse(readFileSync(filePath, 'utf-8')) as ContentEntry[];
  return spells2014
    .filter((e) => e.kind === 'spell')
    .map((e) =>
      ContentEntrySchema.parse({
        ...e,
        id: `2024/spell/${e.id.split('/').pop()}`,
        edition: '2024',
        source: { book: 'SRD5.2', page: e.source.page },
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
  console.log(`Wrote ${species.length} species entries to data/2024/species.json`);

  const backgrounds = await seedBackgrounds();
  writeFileSync(path.join(OUT_DIR, 'backgrounds.json'), JSON.stringify(backgrounds, null, 2));
  console.log(`Wrote ${backgrounds.length} background entries to data/2024/backgrounds.json`);

  const feats = await seedFeats();
  writeFileSync(path.join(OUT_DIR, 'feats.json'), JSON.stringify(feats, null, 2));
  console.log(`Wrote ${feats.length} feats to data/2024/feats.json`);

  const equipment = await seedEquipment();
  const magicItems = await seedMagicItems();
  const items = [...equipment, ...magicItems];
  writeFileSync(path.join(OUT_DIR, 'items.json'), JSON.stringify(items, null, 2));
  console.log(`Wrote ${items.length} items to data/2024/items.json`);

  const spells = reuse2014Spells();
  writeFileSync(path.join(OUT_DIR, 'spells.json'), JSON.stringify(spells, null, 2));
  console.log(`Wrote ${spells.length} spells to data/2024/spells.json (reused from 2014 SRD)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
