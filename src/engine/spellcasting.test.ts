import { beforeAll, describe, expect, it } from 'vitest';
import { loadContentIndex } from '@/content/loader';
import type { ContentEntry } from '@/schema/content';
import { spellSelectionPlan } from './spellcasting';

let index: Map<string, ContentEntry>;
beforeAll(async () => {
  const entries = await loadContentIndex('2014');
  index = new Map(entries.map((e) => [e.id, e]));
});

const cls = (id: string) => index.get(id);

describe('spellSelectionPlan (level 1)', () => {
  it('known casters pull the leveled count from the spells_known column', () => {
    // Bard: 2 cantrips, 4 spells known at level 1.
    const bard = spellSelectionPlan(cls('2014/class/bard'), 1, 3);
    expect(bard).toMatchObject({ mode: 'known', cantripsKnown: 2, leveledCount: 4, wholeList: false, leveledLabel: 'Spells Known' });

    // Sorcerer: 4 cantrips, 2 known.
    expect(spellSelectionPlan(cls('2014/class/sorcerer'), 1, 3)).toMatchObject({ cantripsKnown: 4, leveledCount: 2, mode: 'known' });

    // Warlock (pact): 2 cantrips, 2 known.
    expect(spellSelectionPlan(cls('2014/class/warlock'), 1, 3)).toMatchObject({ cantripsKnown: 2, leveledCount: 2, mode: 'known' });
  });

  it('a level-1 Ranger knows no spells yet (spells_known = 0)', () => {
    expect(spellSelectionPlan(cls('2014/class/ranger'), 1, 3)).toMatchObject({ mode: 'known', leveledCount: 0 });
  });

  it('Wizard scribes a six-spell spellbook, independent of ability modifier', () => {
    const wiz = spellSelectionPlan(cls('2014/class/wizard'), 1, 0);
    expect(wiz).toMatchObject({ mode: 'spellbook', cantripsKnown: 3, leveledCount: 6, leveledLabel: 'Spellbook' });
    // +2 per level.
    expect(spellSelectionPlan(cls('2014/class/wizard'), 5, 0).leveledCount).toBe(14);
  });

  it('full prepared casters (Cleric/Druid) prepare ability mod + level from the whole list', () => {
    // Cleric with +3 Wis: prepares 3 + 1 = 4; whole-list access.
    const cleric = spellSelectionPlan(cls('2014/class/cleric'), 1, 3);
    expect(cleric).toMatchObject({ mode: 'prepared', cantripsKnown: 3, leveledCount: 4, wholeList: true, leveledLabel: 'Prepared Spells' });
    // Never below 1 while it can cast, even with a low modifier.
    expect(spellSelectionPlan(cls('2014/class/druid'), 1, -1).leveledCount).toBe(1);
  });

  it('a level-1 Paladin prepares no leveled spells (no slots yet), regardless of Charisma', () => {
    expect(spellSelectionPlan(cls('2014/class/paladin'), 1, 4)).toMatchObject({ mode: 'prepared', leveledCount: 0 });
    // Half caster gains slots at level 2: mod + floor(2/2) = 4 + 1 = 5.
    expect(spellSelectionPlan(cls('2014/class/paladin'), 2, 4).leveledCount).toBe(5);
  });

  it('a non-caster has no plan', () => {
    expect(spellSelectionPlan(cls('2014/class/fighter'), 1, 3).isCaster).toBe(false);
  });
});
