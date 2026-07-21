import type { ContentEntry } from '../../src/schema';
import { ContentEntrySchema } from '../../src/schema';
import type { ExtractionCandidate } from './extractionSchema';

function normalizeName(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

const RARITY_VALUES = ['mundane', 'common', 'uncommon', 'rare', 'veryRare', 'legendary', 'artifact'] as const;
function mapRarity(rarity: string | undefined): (typeof RARITY_VALUES)[number] {
  const normalized = (rarity ?? '').toLowerCase();
  return RARITY_VALUES.find((r) => r.toLowerCase() === normalized) ?? 'mundane';
}

const CATEGORY_VALUES = ['weapon', 'armor', 'shield', 'adventuringGear', 'tool', 'consumable', 'wondrousItem', 'ring', 'rod', 'staff', 'wand', 'ammunition'] as const;
function mapCategory(category: string | undefined): (typeof CATEGORY_VALUES)[number] {
  const normalized = (category ?? '').toLowerCase();
  return CATEGORY_VALUES.find((c) => c.toLowerCase() === normalized) ?? 'wondrousItem';
}

const SCHOOL_VALUES = ['abjuration', 'conjuration', 'divination', 'enchantment', 'evocation', 'illusion', 'necromancy', 'transmutation'] as const;
function mapSchool(school: string | undefined): (typeof SCHOOL_VALUES)[number] {
  const normalized = (school ?? '').toLowerCase();
  return SCHOOL_VALUES.find((s) => s === normalized) ?? 'evocation';
}

export interface MappedResult {
  entry?: ContentEntry;
  error?: string;
}

/** Converts one flat ExtractionCandidate into a real, schema-validated ContentEntry. */
export function mapCandidate(candidate: ExtractionCandidate, edition: '2014' | '2024', book: 'TCE' | 'PHB2024'): MappedResult {
  const id = `${edition}/${candidate.kind}/extracted-${slugify(candidate.name)}`;
  const base = {
    id,
    edition,
    name: candidate.name,
    source: { book, page: candidate.page },
    origin: 'extracted' as const,
    schemaVersion: 1,
  };

  try {
    if (candidate.kind === 'spell') {
      return {
        entry: ContentEntrySchema.parse({
          ...base,
          kind: 'spell',
          data: {
            level: candidate.level ?? 0,
            school: mapSchool(candidate.school),
            castingTime: candidate.castingTime ?? '1 action',
            range: candidate.range ?? 'Self',
            components: { verbal: candidate.verbal ?? false, somatic: candidate.somatic ?? false, material: candidate.material },
            duration: candidate.duration ?? 'Instantaneous',
            concentration: candidate.concentration ?? false,
            ritual: candidate.ritual ?? false,
            classLists: candidate.classLists ?? [],
            description: candidate.description,
            higherLevels: candidate.higherLevels,
          },
        }),
      };
    }
    if (candidate.kind === 'item') {
      return {
        entry: ContentEntrySchema.parse({
          ...base,
          kind: 'item',
          data: {
            category: mapCategory(candidate.category),
            rarity: mapRarity(candidate.rarity),
            cost: candidate.costGp != null ? { amount: candidate.costGp, currency: 'gp' } : undefined,
            weight: candidate.weight,
            attunement: candidate.attunement ?? false,
            description: candidate.description,
          },
        }),
      };
    }
    if (candidate.kind === 'feat') {
      return {
        entry: ContentEntrySchema.parse({
          ...base,
          kind: 'feat',
          data: { prerequisite: candidate.prerequisite, description: candidate.description },
        }),
      };
    }
    // feature / background / species land as generic 'feature' prose entries for now —
    // slotting extracted content into the class/species/background level tables those
    // kinds require is a manual curation step, not something to auto-wire from raw text.
    return {
      entry: ContentEntrySchema.parse({ ...base, kind: 'feature', data: { description: candidate.description } }),
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

/** True if an entry of this name+kind already exists in the seeded SRD data for this edition. */
export function isSrdDuplicate(candidate: ExtractionCandidate, seedEntries: ContentEntry[]): boolean {
  const target = normalizeName(candidate.name);
  return seedEntries.some((e) => e.kind === candidate.kind && e.origin === 'seed' && normalizeName(e.name) === target);
}
