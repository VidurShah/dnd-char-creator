import { describe, expect, it } from 'vitest';
import { loadContentIndex, groupByKind } from './loader';
import { buildSearchIndex, search } from './search';

describe('content loader', () => {
  it('loads 2014 SRD spells and items', async () => {
    const entries = await loadContentIndex('2014');
    expect(entries.length).toBeGreaterThan(800);

    const grouped = groupByKind(entries);
    expect(grouped.spell?.length).toBeGreaterThan(300);
    expect(grouped.item?.length).toBeGreaterThan(500);
    // >= rather than exact counts for the kinds still being filled out (more
    // backgrounds, feats, and subclasses are being authored). All content is
    // committed now, so these are floors that should only ever ratchet up.
    expect(grouped.class?.length).toBeGreaterThanOrEqual(12);
    expect(grouped.subclass?.length).toBeGreaterThanOrEqual(12);
    expect(grouped.species?.length).toBeGreaterThanOrEqual(13); // 9 base races + 4 subraces (SRD licenses one subrace per applicable race)
    // All 13 PHB backgrounds, not just the single one the SRD licenses.
    expect(grouped.background?.length).toBeGreaterThanOrEqual(13);
    expect(grouped.feat?.length).toBeGreaterThanOrEqual(1);
    expect(grouped.feature?.length).toBeGreaterThan(50);
  });

  // Regression: the extraction pipeline emitted 43 spells with capitalized
  // classLists ("Wizard" not "wizard") while every SRD spell used lowercase.
  // Every consumer matches case-sensitively, so those spells were invisible to
  // the builder's spell pool, "+ Add Spell" on the sheet, and the Library class
  // facet — Booming Blade and Green-Flame Blade among them. Schema-valid,
  // type-correct, and only findable by looking at a rendered screen.
  it.each(['2014', '2024'] as const)('stores every %s spell classList lowercase', async (edition) => {
    const entries = await loadContentIndex(edition);
    const offenders = entries
      .filter((e) => e.kind === 'spell')
      .flatMap((e) => (e.kind === 'spell' ? e.data.classLists : []))
      .filter((c) => c !== c.toLowerCase());
    expect(offenders).toEqual([]);
  });

  it('offers the Tasha\'s cantrips to a wizard, not just SRD ones', async () => {
    const entries = await loadContentIndex('2014');
    // The exact filter BuilderPage and ActionsPanel apply to build a spell pool.
    const wizardCantrips = entries
      .filter((e) => e.kind === 'spell' && e.data.classLists.includes('wizard') && e.data.level === 0)
      .map((e) => e.name);

    expect(wizardCantrips).toContain('Fire Bolt'); // SRD, was always present
    expect(wizardCantrips).toContain('Booming Blade'); // extracted, was excluded
    expect(wizardCantrips).toContain('Green-Flame Blade');
    expect(wizardCantrips).toContain('Lightning Lure');
  });

  it('finds Fireball by name search', async () => {
    const entries = await loadContentIndex('2014');
    const index = buildSearchIndex(entries);
    const ids = search(index, 'fireball');
    expect(ids).toContain('2014/spell/fireball');
  });

  it('loads 2024 SRD content', async () => {
    const entries = await loadContentIndex('2024');
    expect(entries.length).toBeGreaterThan(500);

    const grouped = groupByKind(entries);
    expect(grouped.spell?.length).toBeGreaterThan(300);
    expect(grouped.item?.length).toBeGreaterThan(300);
    expect(grouped.class?.length).toBeGreaterThanOrEqual(12);
    expect(grouped.subclass?.length).toBeGreaterThanOrEqual(12);
    expect(grouped.species?.length).toBeGreaterThanOrEqual(9); // no subraces in 2024
    expect(grouped.background?.length).toBeGreaterThanOrEqual(16); // all 16 PHB2024 backgrounds, not just the 4 SRD5.2 licenses
    expect(grouped.feat?.length).toBeGreaterThanOrEqual(17); // SRD5.2 licenses 17, vs 1 for SRD5.1
  });
});
