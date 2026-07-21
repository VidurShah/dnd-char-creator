import type { ContentEntry } from '@/schema/content';
import { humanizeCamel, humanizeSkill, humanizeSlug } from '@/lib/text';

/** Content index, used to turn the refs a class/subclass/species/background
 * carries into readable names. Optional so the component still renders (with
 * slug fallbacks) anywhere an index isn't handy. */
type EntryIndex = Map<string, ContentEntry> | undefined;

/**
 * Ref -> its entry's name. Handles both full ids ("2014/item/greataxe") and the
 * bare slugs equipment lists use ("greataxe"), matching `resolveItemRef`'s rule.
 * Falls back to a humanized slug so a ref that resolves to nothing still reads
 * as a name rather than as a raw id.
 */
function refName(ref: string, byId: EntryIndex): string {
  const direct = byId?.get(ref);
  if (direct) return direct.name;
  if (byId && !ref.includes('/')) {
    for (const entry of byId.values()) if (entry.id.endsWith(`/${ref}`)) return entry.name;
  }
  return humanizeSlug(ref.split('/').pop() ?? ref);
}

export function EntryDetail({ entry, byId }: { entry: ContentEntry; byId?: EntryIndex }) {
  return (
    <article className="border-2 border-ink-900/20 bg-kraft-50 p-6 dark:border-kraft-100/20 dark:bg-charcoal-800">
      <div className="flex items-start justify-between gap-3">
        <h2 className="font-display text-xl text-ink-900 dark:text-kraft-100">{entry.name}</h2>
        <span className="-rotate-2 shrink-0 whitespace-nowrap border-2 border-rust-500 px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-rust-500">
          {entry.source.book}
          {entry.source.page ? ` p.${entry.source.page}` : ''}
        </span>
      </div>

      {entry.crossEditionRef && (
        <p className="mt-1 font-mono text-[10px] uppercase tracking-wide text-olive-500">
          Linked from {entry.crossEditionRef.startsWith('2024') ? '5.5e' : '5e'}
        </p>
      )}

      <hr className="rule-sketch my-4" />

      {entry.kind === 'spell' && <SpellDetail data={entry.data} />}
      {entry.kind === 'item' && <ItemDetail data={entry.data} />}
      {entry.kind === 'feat' && <FeatDetail data={entry.data} />}
      {entry.kind === 'feature' && <p className="whitespace-pre-line text-sm leading-relaxed">{entry.data.description}</p>}
      {entry.kind === 'class' && <ClassDetail data={entry.data} byId={byId} />}
      {entry.kind === 'subclass' && <SubclassDetail data={entry.data} byId={byId} />}
      {entry.kind === 'species' && <SpeciesDetail data={entry.data} byId={byId} />}
      {entry.kind === 'background' && <BackgroundDetail data={entry.data} byId={byId} />}
    </article>
  );
}

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 text-sm">
      <span className="text-ink-700 dark:text-kraft-200">{label}</span>
      <span className="font-mono text-right">{value}</span>
    </div>
  );
}

function SpellDetail({ data }: { data: Extract<ContentEntry, { kind: 'spell' }>['data'] }) {
  const components = [
    data.components.verbal && 'V',
    data.components.somatic && 'S',
    data.components.material && 'M',
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <>
      <div className="grid grid-cols-2 gap-x-6 gap-y-1.5">
        <StatRow label="Casting Time" value={data.castingTime} />
        <StatRow label="Range" value={data.range} />
        <StatRow label="Components" value={components} />
        <StatRow label="Duration" value={`${data.concentration ? 'Concentration, ' : ''}${data.duration}`} />
      </div>
      {data.components.material && (
        <p className="mt-3 text-sm italic text-ink-700 dark:text-kraft-200">
          Material: {data.components.material}
        </p>
      )}
      <p className="mt-4 whitespace-pre-line text-sm leading-relaxed">{data.description}</p>
      {data.higherLevels && (
        <p className="mt-3 whitespace-pre-line text-sm leading-relaxed">
          <span className="font-medium">At Higher Levels. </span>
          {data.higherLevels}
        </p>
      )}
    </>
  );
}

function ItemDetail({ data }: { data: Extract<ContentEntry, { kind: 'item' }>['data'] }) {
  return (
    <>
      <div className="grid grid-cols-2 gap-x-6 gap-y-1.5">
        <StatRow label="Category" value={humanizeCamel(data.category)} />
        <StatRow label="Rarity" value={humanizeCamel(data.rarity)} />
        {data.cost && <StatRow label="Cost" value={`${data.cost.amount} ${data.cost.currency}`} />}
        {data.weight != null && <StatRow label="Weight" value={`${data.weight} lb.`} />}
        {data.weapon && (
          <>
            <StatRow
              label="Damage"
              value={`${data.weapon.damageDice} ${data.weapon.damageType}${
                data.weapon.versatileDamageDice ? ` (${data.weapon.versatileDamageDice} two-handed)` : ''
              }`}
            />
            <StatRow label="Properties" value={data.weapon.properties.join(', ') || '—'} />
          </>
        )}
        {data.armor && (
          <>
            <StatRow
              label="Armor Class"
              value={`${data.armor.baseAc}${data.armor.addDexMod ? ' + Dex' : ''}${
                data.armor.maxDexBonus != null ? ` (max ${data.armor.maxDexBonus})` : ''
              }`}
            />
            {data.armor.strengthRequirement ? (
              <StatRow label="Str Required" value={String(data.armor.strengthRequirement)} />
            ) : null}
          </>
        )}
      </div>
      {data.description && <p className="mt-4 whitespace-pre-line text-sm leading-relaxed">{data.description}</p>}
    </>
  );
}

function FeatDetail({ data }: { data: Extract<ContentEntry, { kind: 'feat' }>['data'] }) {
  return (
    <>
      {data.prerequisite && <StatRow label="Prerequisite" value={data.prerequisite} />}
      <p className="mt-4 whitespace-pre-line text-sm leading-relaxed">{data.description}</p>
    </>
  );
}

/** Prose paragraph, rendered only when there is prose. Every kind's description
 * is optional, and an unwritten one should leave no empty gap in the layout. */
function Description({ text }: { text?: string }) {
  if (!text?.trim()) return null;
  return <p className="mt-4 whitespace-pre-line text-sm leading-relaxed">{text}</p>;
}

/** A labelled list of refs/slugs, e.g. a species' traits or a background's equipment. */
function RefList({ label, refs, byId }: { label: string; refs: string[]; byId: EntryIndex }) {
  if (refs.length === 0) return null;
  return (
    <div className="mt-4">
      <h3 className="font-mono text-[10px] font-semibold uppercase tracking-wider text-olive-500">{label}</h3>
      <ul className="mt-1 list-inside list-disc text-sm leading-relaxed">
        {refs.map((ref, i) => (
          <li key={`${ref}-${i}`}>{refName(ref, byId)}</li>
        ))}
      </ul>
    </div>
  );
}

function ClassDetail({ data, byId }: { data: Extract<ContentEntry, { kind: 'class' }>['data']; byId: EntryIndex }) {
  const level1 = data.levels.find((l) => l.level === 1);
  return (
    <>
      <div className="grid grid-cols-2 gap-x-6 gap-y-1.5">
        <StatRow label="Hit Die" value={data.hitDie} />
        <StatRow label="Saving Throws" value={data.savingThrowProficiencies.map((a) => a.toUpperCase()).join(', ') || '—'} />
        <StatRow label="Armor" value={data.armorProficiencies.map(humanizeSlug).join(', ') || '—'} />
        <StatRow label="Weapons" value={data.weaponProficiencies.map(humanizeSlug).join(', ') || '—'} />
        {data.toolProficiencies?.length ? <StatRow label="Tools" value={data.toolProficiencies.map(humanizeSlug).join(', ')} /> : null}
        {data.skillChoice && <StatRow label="Skills" value={`Choose ${data.skillChoice.count}`} />}
        {data.spellcasting && (
          <>
            <StatRow label="Spellcasting" value={humanizeCamel(data.spellcasting.progression)} />
            <StatRow label="Spell Ability" value={data.spellcasting.ability.toUpperCase()} />
          </>
        )}
      </div>
      <Description text={data.description} />
      <RefList label="Level 1 Features" refs={level1?.featureRefs ?? []} byId={byId} />
    </>
  );
}

function SubclassDetail({ data, byId }: { data: Extract<ContentEntry, { kind: 'subclass' }>['data']; byId: EntryIndex }) {
  const levels = Object.entries(data.featuresByLevel).sort((a, b) => Number(a[0]) - Number(b[0]));
  return (
    <>
      <div className="grid grid-cols-2 gap-x-6 gap-y-1.5">
        <StatRow label="Class" value={refName(data.parentClassRef, byId)} />
      </div>
      <Description text={data.description} />
      {levels.length > 0 && (
        <div className="mt-4">
          <h3 className="font-mono text-[10px] font-semibold uppercase tracking-wider text-olive-500">Features by Level</h3>
          <ul className="mt-1 text-sm leading-relaxed">
            {levels.map(([level, refs]) => (
              <li key={level}>
                <span className="font-medium">Level {level}. </span>
                {refs.map((r) => refName(r, byId)).join(', ')}
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}

function SpeciesDetail({ data, byId }: { data: Extract<ContentEntry, { kind: 'species' }>['data']; byId: EntryIndex }) {
  return (
    <>
      <div className="grid grid-cols-2 gap-x-6 gap-y-1.5">
        <StatRow label="Size" value={humanizeCamel(data.size)} />
        <StatRow label="Speed" value={`${data.speed} ft.`} />
        {data.parentSpeciesRef && <StatRow label="Subrace Of" value={refName(data.parentSpeciesRef, byId)} />}
      </div>
      <Description text={data.description} />
      <RefList label="Traits" refs={data.traits} byId={byId} />
    </>
  );
}

function BackgroundDetail({ data, byId }: { data: Extract<ContentEntry, { kind: 'background' }>['data']; byId: EntryIndex }) {
  return (
    <>
      <div className="grid grid-cols-2 gap-x-6 gap-y-1.5">
        <StatRow label="Skills" value={data.skillProficiencies.map(humanizeSkill).join(', ') || '—'} />
        {data.toolProficiencies?.length ? <StatRow label="Tools" value={data.toolProficiencies.map(humanizeSlug).join(', ')} /> : null}
        {/* 2024 backgrounds replace racial ability bonuses and grant an Origin feat. */}
        {data.abilityScoreOptions?.length ? (
          <StatRow label="Ability Scores" value={data.abilityScoreOptions.map((a) => a.toUpperCase()).join(', ')} />
        ) : null}
        {data.grantedFeatRef && <StatRow label="Origin Feat" value={refName(data.grantedFeatRef, byId)} />}
        {data.featureRef && <StatRow label="Feature" value={refName(data.featureRef, byId)} />}
      </div>
      <Description text={data.description} />
      <RefList label="Equipment" refs={data.equipment} byId={byId} />
      {data.featureRef && byId?.get(data.featureRef)?.kind === 'feature' && (
        <div className="mt-4">
          <h3 className="font-mono text-[10px] font-semibold uppercase tracking-wider text-olive-500">
            {refName(data.featureRef, byId)}
          </h3>
          <p className="mt-1 whitespace-pre-line text-sm leading-relaxed">
            {(byId.get(data.featureRef)!.data as { description: string }).description}
          </p>
        </div>
      )}
    </>
  );
}
