import type { ItemPayload } from '@/schema/content';
import { ITEM_CATEGORIES, ITEM_RARITIES } from '@/features/library/filters';
import { humanizeCamel } from '@/lib/text';

interface ItemFormProps {
  value: ItemPayload;
  onChange: (value: ItemPayload) => void;
}

export function ItemForm({ value, onChange }: ItemFormProps) {
  const isWeapon = value.category === 'weapon';
  const isArmorLike = value.category === 'armor' || value.category === 'shield';
  const requiresAttunement = value.attunement !== false;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-4">
        <label className="flex flex-col gap-1">
          <span className="font-mono text-xs uppercase tracking-wider text-ink-500 dark:text-kraft-300">Category</span>
          <select
            value={value.category}
            onChange={(e) => onChange({ ...value, category: e.target.value as ItemPayload['category'] })}
            className="border-b-2 border-dashed border-ink-900/30 bg-transparent px-1 py-1 outline-none focus:border-rust-500 dark:border-kraft-100/30"
          >
            {ITEM_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {humanizeCamel(c)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="font-mono text-xs uppercase tracking-wider text-ink-500 dark:text-kraft-300">Rarity</span>
          <select
            value={value.rarity}
            onChange={(e) => onChange({ ...value, rarity: e.target.value as ItemPayload['rarity'] })}
            className="border-b-2 border-dashed border-ink-900/30 bg-transparent px-1 py-1 outline-none focus:border-rust-500 dark:border-kraft-100/30"
          >
            {ITEM_RARITIES.map((r) => (
              <option key={r} value={r}>
                {humanizeCamel(r)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="font-mono text-xs uppercase tracking-wider text-ink-500 dark:text-kraft-300">Cost (gp, optional)</span>
          <input
            type="number"
            min={0}
            value={value.cost?.amount ?? ''}
            onChange={(e) =>
              onChange({ ...value, cost: e.target.value === '' ? undefined : { amount: Number(e.target.value), currency: 'gp' } })
            }
            className="border-b-2 border-dashed border-ink-900/30 bg-transparent px-1 py-1 outline-none focus:border-rust-500 dark:border-kraft-100/30"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="font-mono text-xs uppercase tracking-wider text-ink-500 dark:text-kraft-300">Weight (lb, optional)</span>
          <input
            type="number"
            min={0}
            value={value.weight ?? ''}
            onChange={(e) => onChange({ ...value, weight: e.target.value === '' ? undefined : Number(e.target.value) })}
            className="border-b-2 border-dashed border-ink-900/30 bg-transparent px-1 py-1 outline-none focus:border-rust-500 dark:border-kraft-100/30"
          />
        </label>
      </div>

      <label className="flex items-center gap-1.5 text-sm">
        <input
          type="checkbox"
          checked={requiresAttunement}
          onChange={(e) => onChange({ ...value, attunement: e.target.checked })}
        />
        Requires attunement
      </label>

      {isWeapon && (
        <div className="border-2 border-ink-900/15 p-3 dark:border-kraft-100/15">
          <p className="mb-2 font-mono text-xs uppercase tracking-wider text-ink-500 dark:text-kraft-300">Weapon</p>
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1 text-sm">
              Damage dice (e.g. 1d8)
              <input
                type="text"
                value={value.weapon?.damageDice ?? ''}
                onChange={(e) =>
                  onChange({
                    ...value,
                    weapon: { damageDice: e.target.value, damageType: value.weapon?.damageType ?? 'slashing', properties: value.weapon?.properties ?? [] },
                  })
                }
                className="border-b border-dashed border-ink-900/30 bg-transparent px-1 py-1 outline-none focus:border-rust-500 dark:border-kraft-100/30"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              Damage type
              <input
                type="text"
                value={value.weapon?.damageType ?? ''}
                onChange={(e) =>
                  onChange({
                    ...value,
                    weapon: { damageDice: value.weapon?.damageDice ?? '1d6', damageType: e.target.value as never, properties: value.weapon?.properties ?? [] },
                  })
                }
                className="border-b border-dashed border-ink-900/30 bg-transparent px-1 py-1 outline-none focus:border-rust-500 dark:border-kraft-100/30"
              />
            </label>
            <label className="col-span-2 flex flex-col gap-1 text-sm">
              Properties (comma-separated: finesse, light, versatile...)
              <input
                type="text"
                value={value.weapon?.properties.join(', ') ?? ''}
                onChange={(e) =>
                  onChange({
                    ...value,
                    weapon: {
                      damageDice: value.weapon?.damageDice ?? '1d6',
                      damageType: value.weapon?.damageType ?? 'slashing',
                      properties: e.target.value.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean),
                    },
                  })
                }
                className="border-b border-dashed border-ink-900/30 bg-transparent px-1 py-1 outline-none focus:border-rust-500 dark:border-kraft-100/30"
              />
            </label>
          </div>
        </div>
      )}

      {isArmorLike && (
        <div className="border-2 border-ink-900/15 p-3 dark:border-kraft-100/15">
          <p className="mb-2 font-mono text-xs uppercase tracking-wider text-ink-500 dark:text-kraft-300">Armor</p>
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1 text-sm">
              Base AC
              <input
                type="number"
                value={value.armor?.baseAc ?? 10}
                onChange={(e) =>
                  onChange({ ...value, armor: { baseAc: Number(e.target.value), addDexMod: value.armor?.addDexMod ?? true, stealthDisadvantage: value.armor?.stealthDisadvantage ?? false } })
                }
                className="border-b border-dashed border-ink-900/30 bg-transparent px-1 py-1 outline-none focus:border-rust-500 dark:border-kraft-100/30"
              />
            </label>
            <label className="flex items-center gap-1.5 pt-5 text-sm">
              <input
                type="checkbox"
                checked={value.armor?.addDexMod ?? true}
                onChange={(e) => onChange({ ...value, armor: { baseAc: value.armor?.baseAc ?? 10, addDexMod: e.target.checked, stealthDisadvantage: value.armor?.stealthDisadvantage ?? false } })}
              />
              Adds Dex modifier
            </label>
          </div>
        </div>
      )}

      <label className="flex flex-col gap-1">
        <span className="font-mono text-xs uppercase tracking-wider text-ink-500 dark:text-kraft-300">Description</span>
        <textarea
          value={value.description}
          onChange={(e) => onChange({ ...value, description: e.target.value })}
          rows={4}
          className="border-2 border-ink-900/20 bg-transparent p-2 text-sm outline-none focus:border-rust-500 dark:border-kraft-100/20"
        />
      </label>
    </div>
  );
}
