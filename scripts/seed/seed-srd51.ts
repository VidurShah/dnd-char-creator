/**
 * Seeds data/2014/{spells,items}.json from the 5e-bits SRD API
 * (https://www.dnd5eapi.co), which serves the freely-licensed SRD 5.1
 * (2014 rules) content. Run with: pnpm seed:srd51
 *
 * This is a dev-only build step, not something the shipped app calls at
 * runtime — output is committed static JSON under data/2014/.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import {
  type ContentEntry,
  type DamageType,
  type Effect,
  ContentEntrySchema,
} from '../../src/schema';

const API_BASE = 'https://www.dnd5eapi.co/api/2014';
const API_ROOT = 'https://www.dnd5eapi.co';
const OUT_DIR = path.resolve(import.meta.dirname, '../../data/2014');
const CONCURRENCY = 12;

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`GET ${url} -> ${res.status}`);
  return res.json() as Promise<T>;
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
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

// ---------------------------------------------------------------------------
// Spells
// ---------------------------------------------------------------------------

interface ApiSpellRef {
  index: string;
  url: string;
}

interface ApiSpell {
  index: string;
  name: string;
  desc: string[];
  higher_level?: string[];
  range: string;
  components: string[];
  material?: string;
  ritual: boolean;
  duration: string;
  concentration: boolean;
  casting_time: string;
  level: number;
  school: { index: string };
  classes: { index: string }[];
}

function mapSpell(s: ApiSpell): ContentEntry {
  return ContentEntrySchema.parse({
    id: `2014/spell/${s.index}`,
    edition: '2014',
    kind: 'spell',
    name: s.name,
    source: { book: 'SRD5.1' },
    origin: 'seed',
    schemaVersion: 1,
    data: {
      level: s.level,
      school: s.school.index,
      castingTime: s.casting_time,
      range: s.range,
      components: {
        verbal: s.components.includes('V'),
        somatic: s.components.includes('S'),
        material: s.components.includes('M') ? s.material : undefined,
      },
      duration: s.duration,
      concentration: s.concentration,
      ritual: s.ritual,
      classLists: s.classes.map((c) => c.index),
      description: s.desc.join('\n\n'),
      higherLevels: s.higher_level?.join('\n\n') || undefined,
    },
  });
}

async function seedSpells(): Promise<ContentEntry[]> {
  const list = await fetchJson<{ results: ApiSpellRef[] }>(`${API_BASE}/spells`);
  console.log(`Fetching ${list.results.length} spells...`);
  const spells = await mapWithConcurrency(list.results, CONCURRENCY, (ref) =>
    fetchJson<ApiSpell>(`${API_ROOT}${ref.url}`),
  );
  return spells.map(mapSpell);
}

// ---------------------------------------------------------------------------
// Equipment (mundane weapons, armor, gear)
// ---------------------------------------------------------------------------

interface ApiEquipmentRef {
  index: string;
  url: string;
}

interface ApiEquipment {
  index: string;
  name: string;
  desc?: string[];
  equipment_category: { index: string };
  cost?: { quantity: number; unit: string };
  weight?: number;
  // weapon
  weapon_category?: string;
  damage?: { damage_dice: string; damage_type: { index: string } };
  two_handed_damage?: { damage_dice: string };
  range?: { normal: number; long?: number };
  properties?: { index: string }[];
  // armor
  armor_category?: string;
  armor_class?: { base: number; dex_bonus: boolean; max_bonus?: number };
  str_minimum?: number;
  stealth_disadvantage?: boolean;
  // gear
  gear_category?: { index: string };
}

function mapCategory(e: ApiEquipment): 'weapon' | 'armor' | 'shield' | 'tool' | 'ammunition' | 'adventuringGear' {
  if (e.equipment_category.index === 'weapon') return 'weapon';
  if (e.equipment_category.index === 'armor') return e.armor_category === 'Shield' ? 'shield' : 'armor';
  if (e.equipment_category.index === 'tools') return 'tool';
  if (e.gear_category?.index === 'ammunition') return 'ammunition';
  return 'adventuringGear';
}

function mapCurrency(unit: string): 'cp' | 'sp' | 'ep' | 'gp' | 'pp' {
  return (['cp', 'sp', 'ep', 'gp', 'pp'] as const).includes(unit as 'cp')
    ? (unit as 'cp' | 'sp' | 'ep' | 'gp' | 'pp')
    : 'gp';
}

function mapEquipment(e: ApiEquipment): ContentEntry {
  const category = mapCategory(e);

  return ContentEntrySchema.parse({
    id: `2014/item/${e.index}`,
    edition: '2014',
    kind: 'item',
    name: e.name,
    source: { book: 'SRD5.1' },
    origin: 'seed',
    schemaVersion: 1,
    data: {
      category,
      rarity: 'mundane',
      cost: e.cost ? { amount: e.cost.quantity, currency: mapCurrency(e.cost.unit) } : undefined,
      weight: e.weight,
      attunement: false,
      description: (e.desc ?? []).join('\n\n'),
      weapon:
        category === 'weapon' && e.damage
          ? {
              damageDice: e.damage.damage_dice,
              damageType: e.damage.damage_type.index as DamageType,
              properties: (e.properties ?? []).map((p) => p.index),
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
  const list = await fetchJson<{ results: ApiEquipmentRef[] }>(`${API_BASE}/equipment`);
  console.log(`Fetching ${list.results.length} equipment items...`);
  const items = await mapWithConcurrency(list.results, CONCURRENCY, (ref) =>
    fetchJson<ApiEquipment>(`${API_ROOT}${ref.url}`),
  );
  return items.map(mapEquipment);
}

// ---------------------------------------------------------------------------
// Magic items
// ---------------------------------------------------------------------------

interface ApiMagicItemRef {
  index: string;
  url: string;
}

interface ApiMagicItem {
  index: string;
  name: string;
  desc?: string[];
  equipment_category: { index: string };
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
  return 'common'; // "Varies" and anything unrecognized
}

/**
 * Hand-curated numeric effects for a handful of well-known, unconditional magic
 * items. Deliberately not parsed from prose (too fragile/risky to auto-derive
 * mechanics text) and deliberately small — conditional items (e.g. Bracers of
 * Defense's "only if unarmored") need a specialRule, not a flat effect, and are
 * left prose-only for now. Extend this as more items prove worth automating.
 */
const KNOWN_ITEM_EFFECTS: Record<string, Effect[]> = {
  'ring-of-protection': [
    { op: 'acBonus', amount: '1' },
    { op: 'rollBonus', on: ['savingThrow'], amount: '1' },
  ],
  'cloak-of-protection': [
    { op: 'acBonus', amount: '1' },
    { op: 'rollBonus', on: ['savingThrow'], amount: '1' },
  ],
};

function mapMagicItem(m: ApiMagicItem): ContentEntry | null {
  // Skip variant-group parents with no description (e.g. "Potion of Healing" base
  // entry when the real content lives on -common/-greater/etc. variant entries).
  if ((m.variants?.length ?? 0) > 0 && (m.desc?.length ?? 0) === 0) return null;

  const description = (m.desc ?? []).join('\n\n');

  return ContentEntrySchema.parse({
    id: `2014/item/${m.index}`,
    edition: '2014',
    kind: 'item',
    name: m.name,
    source: { book: 'SRD5.1' },
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
  const list = await fetchJson<{ results: ApiMagicItemRef[] }>(`${API_BASE}/magic-items`);
  console.log(`Fetching ${list.results.length} magic items...`);
  const items = await mapWithConcurrency(list.results, CONCURRENCY, (ref) =>
    fetchJson<ApiMagicItem>(`${API_ROOT}${ref.url}`),
  );
  return items.map(mapMagicItem).filter((entry): entry is ContentEntry => entry !== null);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });

  const spells = await seedSpells();
  writeFileSync(path.join(OUT_DIR, 'spells.json'), JSON.stringify(spells, null, 2));
  console.log(`Wrote ${spells.length} spells to data/2014/spells.json`);

  const equipment = await seedEquipment();
  const magicItems = await seedMagicItems();
  const items = [...equipment, ...magicItems];
  writeFileSync(path.join(OUT_DIR, 'items.json'), JSON.stringify(items, null, 2));
  console.log(`Wrote ${items.length} items to data/2014/items.json`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
