import { beforeAll, describe, expect, it } from 'vitest';
import { loadContentIndex } from '@/content/loader';
import { computeSheet } from '@/engine/compute';
import type { ContentEntry } from '@/schema/content';
import type { Character } from '@/schema/character';
import { buildShareModel, shareModelToHtml, shareModelToMarkdown } from './shareCharacter';

let index: Map<string, ContentEntry>;
beforeAll(async () => {
  const entries = await loadContentIndex('2014');
  index = new Map(entries.map((e) => [e.id, e]));
});

function wizard(): Character {
  const now = Date.now();
  return {
    id: 't',
    edition: '2014',
    name: 'Mira the Wise',
    createdAt: now,
    updatedAt: now,
    schemaVersion: 1,
    build: {
      abilityMethod: 'manual',
      baseAbilities: { str: 8, dex: 14, con: 13, int: 16, wis: 12, cha: 10 },
      species: { ref: '2014/species/high-elf', decisions: [] },
      background: { ref: '2014/background/acolyte', decisions: [] },
      classes: [{ classRef: '2014/class/wizard', levels: 1, decisionsByLevel: {} }],
      levelOrder: [{ classRef: '2014/class/wizard' }],
      knownSpells: ['2014/spell/fireball', '2014/spell/mage-hand'],
      preparedSpells: [],
      feats: [],
      abilityImprovements: [],
    },
    state: {
      hp: { current: 7, tempHp: 0 },
      hitDiceSpent: {},
      conditions: [],
      exhaustion: 0,
      deathSaves: { successes: 0, failures: 0 },
      spellSlotsSpent: [],
      pactSlotsSpent: 0,
      resourcesSpent: {},
      inventory: [],
      currency: { cp: 0, sp: 0, ep: 0, gp: 12, pp: 0 },
      inspiration: false,
      raging: false,
      notes: 'Seeks the lost library of Xar.',
      languages: 'Common, Elvish',
      alignment: 'Neutral Good',
      personalityTraits: 'Endlessly curious.',
      ideals: 'Knowledge.',
      bonds: 'My mentor.',
      flaws: 'Overconfident.',
      rollLog: [],
    },
  };
}

describe('character share export', () => {
  it('builds a model with the headline facts', () => {
    const c = wizard();
    const model = buildShareModel(c, computeSheet(c, index), index);
    expect(model.name).toBe('Mira the Wise');
    expect(model.subtitle).toMatch(/Level 1/);
    expect(model.subtitle).toMatch(/High Elf/);
    expect(model.subtitle).toMatch(/Wizard 1/);
    // abilities carry score + modifier (High Elf adds +1 Int: 16 -> 17)
    const int = model.abilities.find((a) => a.label === 'Intelligence');
    expect(int).toMatchObject({ score: 17, mod: '+3' });
    // spells grouped by level, granted flagged
    expect(model.spellcasting).toBeTruthy();
    expect(model.spells.some((g) => g.names.includes('Fireball'))).toBe(true);
    // lore populated
    expect(model.lore.map((l) => l.label)).toEqual(expect.arrayContaining(['Alignment', 'Backstory']));
  });

  it('renders Markdown with the expected sections', () => {
    const c = wizard();
    const md = shareModelToMarkdown(buildShareModel(c, computeSheet(c, index), index));
    expect(md).toContain('# Mira the Wise');
    expect(md).toContain('## Ability Scores');
    expect(md).toContain('## Spellcasting');
    expect(md).toContain('## Features & Traits');
    expect(md).toContain('Fireball');
  });

  it('renders self-contained HTML (no external references)', () => {
    const c = wizard();
    const html = shareModelToHtml(buildShareModel(c, computeSheet(c, index), index));
    expect(html.startsWith('<!doctype html>')).toBe(true);
    expect(html).toContain('Mira the Wise');
    // no external network references — fully offline/shareable
    expect(html).not.toMatch(/https?:\/\//);
    expect(html).not.toMatch(/<script/i);
  });

  it('escapes HTML-special characters in user text', () => {
    const c = wizard();
    c.name = 'Bob <script>alert(1)</script>';
    const html = shareModelToHtml(buildShareModel(c, computeSheet(c, index), index));
    expect(html).toContain('Bob &lt;script&gt;');
    expect(html).not.toContain('<script>alert(1)</script>');
  });
});
