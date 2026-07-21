import {
  ITEM_CATEGORIES,
  ITEM_RARITIES,
  SPELL_LEVELS,
  SPELL_LEVEL_LABEL,
  SPELL_SCHOOLS,
  type ItemCategory,
  type ItemFilters,
  type ItemRarity,
  type SpellFilters,
  type SpellSchool,
  toggleInSet,
} from './filters';
import { humanizeCamel } from '@/lib/text';

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-sm border px-2 py-1 font-mono text-[11px] uppercase tracking-wide transition-colors ${
        active
          ? 'border-ink-900 bg-ink-900 text-kraft-50 dark:border-kraft-100 dark:bg-kraft-100 dark:text-ink-900'
          : 'border-ink-900/25 text-ink-700 hover:border-ink-900/50 dark:border-kraft-100/25 dark:text-kraft-200'
      }`}
    >
      {children}
    </button>
  );
}

function FilterGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1.5 font-mono text-[11px] uppercase tracking-wider text-ink-500 dark:text-kraft-300">
        {label}
      </p>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

interface SpellFilterPanelProps {
  filters: SpellFilters;
  onChange: (filters: SpellFilters) => void;
  availableClasses: string[];
}

export function SpellFilterPanel({ filters, onChange, availableClasses }: SpellFilterPanelProps) {
  return (
    <div className="flex flex-col gap-4">
      <FilterGroup label="Level">
        {SPELL_LEVELS.map((level) => (
          <Chip key={level} active={filters.levels.has(level)} onClick={() => onChange({ ...filters, levels: toggleInSet(filters.levels, level) })}>
            {SPELL_LEVEL_LABEL[level]}
          </Chip>
        ))}
      </FilterGroup>

      <FilterGroup label="School">
        {SPELL_SCHOOLS.map((school) => (
          <Chip
            key={school}
            active={filters.schools.has(school)}
            onClick={() => onChange({ ...filters, schools: toggleInSet(filters.schools, school as SpellSchool) })}
          >
            {school}
          </Chip>
        ))}
      </FilterGroup>

      {availableClasses.length > 0 && (
        <FilterGroup label="Class">
          {availableClasses.map((cls) => (
            <Chip key={cls} active={filters.classes.has(cls)} onClick={() => onChange({ ...filters, classes: toggleInSet(filters.classes, cls) })}>
              {cls}
            </Chip>
          ))}
        </FilterGroup>
      )}

      <FilterGroup label="Casting">
        <Chip active={filters.concentrationOnly} onClick={() => onChange({ ...filters, concentrationOnly: !filters.concentrationOnly })}>
          Concentration
        </Chip>
        <Chip active={filters.ritualOnly} onClick={() => onChange({ ...filters, ritualOnly: !filters.ritualOnly })}>
          Ritual
        </Chip>
      </FilterGroup>
    </div>
  );
}

interface ItemFilterPanelProps {
  filters: ItemFilters;
  onChange: (filters: ItemFilters) => void;
}

export function ItemFilterPanel({ filters, onChange }: ItemFilterPanelProps) {
  return (
    <div className="flex flex-col gap-4">
      <FilterGroup label="Category">
        {ITEM_CATEGORIES.map((category) => (
          <Chip
            key={category}
            active={filters.categories.has(category)}
            onClick={() => onChange({ ...filters, categories: toggleInSet(filters.categories, category as ItemCategory) })}
          >
            {humanizeCamel(category)}
          </Chip>
        ))}
      </FilterGroup>

      <FilterGroup label="Rarity">
        {ITEM_RARITIES.map((rarity) => (
          <Chip
            key={rarity}
            active={filters.rarities.has(rarity)}
            onClick={() => onChange({ ...filters, rarities: toggleInSet(filters.rarities, rarity as ItemRarity) })}
          >
            {humanizeCamel(rarity)}
          </Chip>
        ))}
      </FilterGroup>

      <div className="flex gap-4">
        <label className="flex flex-col gap-1 text-xs">
          <span className="font-mono uppercase tracking-wider text-ink-500 dark:text-kraft-300">Max cost (gp)</span>
          <input
            type="number"
            min={0}
            value={filters.maxCostGp ?? ''}
            onChange={(e) => onChange({ ...filters, maxCostGp: e.target.value === '' ? null : Number(e.target.value) })}
            className="w-24 border-b-2 border-dashed border-ink-900/30 bg-transparent px-1 py-0.5 font-mono outline-none focus:border-rust-500 dark:border-kraft-100/30"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs">
          <span className="font-mono uppercase tracking-wider text-ink-500 dark:text-kraft-300">Max weight (lb)</span>
          <input
            type="number"
            min={0}
            value={filters.maxWeight ?? ''}
            onChange={(e) => onChange({ ...filters, maxWeight: e.target.value === '' ? null : Number(e.target.value) })}
            className="w-24 border-b-2 border-dashed border-ink-900/30 bg-transparent px-1 py-0.5 font-mono outline-none focus:border-rust-500 dark:border-kraft-100/30"
          />
        </label>
      </div>
    </div>
  );
}
