import { beforeAll, describe, expect, it } from 'vitest';
import { loadContentIndex } from '@/content/loader';
import type { ContentEntry } from '@/schema/content';
import type { Character } from '@/schema/character';
import { enumerateDecisions, unresolvedDecisions } from './decisions';
import { computeSheet } from './compute';
import { resolveOptionQuery } from './optionQuery';

let index: Map<string, ContentEntry>;

beforeAll(async () => {
  const entries = await loadContentIndex('2014');
  index = new Map(entries.map((e) => [e.id, e]));
});

function fighterCharacter(decisionsByLevel: Record<string, { decisionId: string; choice: string[] }[]>): Character {
  const now = Date.now();
  return {
    id: 'test',
    edition: '2014',
    name: 'Test',
    createdAt: now,
    updatedAt: now,
    schemaVersion: 1,
    build: {
      abilityMethod: 'manual',
      baseAbilities: { str: 15, dex: 13, con: 14, int: 10, wis: 12, cha: 8 },
      species: { ref: '2014/species/human', decisions: [] },
      background: { ref: '2014/background/acolyte', decisions: [] },
      classes: [{ classRef: '2014/class/fighter', levels: 1, decisionsByLevel }],
      levelOrder: [{ classRef: '2014/class/fighter' }],
      knownSpells: [],
      preparedSpells: [],
      feats: [],
      abilityImprovements: [],
    },
    state: {
      hp: { current: 1, tempHp: 0 },
      hitDiceSpent: {},
      conditions: [],
      exhaustion: 0,
      deathSaves: { successes: 0, failures: 0 },
      spellSlotsSpent: [],
      pactSlotsSpent: 0,
      resourcesSpent: {},
      inventory: [],
      currency: { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 },
      inspiration: false,
      raging: false,
      notes: '',
      languages: '',
      alignment: '',
      personalityTraits: '',
      ideals: '',
      bonds: '',
      flaws: '',
      rollLog: [],
    },
  };
}

describe('decisions engine', () => {
  it('surfaces the fighter skill choice as unresolved', () => {
    const character = fighterCharacter({});
    const unresolved = unresolvedDecisions(character, index);
    expect(unresolved).toContainEqual(
      expect.objectContaining({ decisionId: 'fighter/skills', count: 2, scope: 'class' }),
    );
  });

  it('no longer lists a decision once it has been recorded', () => {
    const character = fighterCharacter({
      '1': [{ decisionId: 'fighter/skills', choice: ['athletics', 'perception'] }],
    });
    const unresolved = unresolvedDecisions(character, index);
    expect(unresolved.find((d) => d.decisionId === 'fighter/skills')).toBeUndefined();

    // enumerateDecisions still reports it — only unresolvedDecisions filters recorded ones.
    const all = enumerateDecisions(character, index);
    expect(all.find((d) => d.decisionId === 'fighter/skills')).toBeDefined();
  });

  it("surfaces a species' own decision points, scoped to the species", () => {
    const character = fighterCharacter({});
    character.build.species = { ref: '2014/species/variant-human', decisions: [] };
    const unresolved = unresolvedDecisions(character, index);
    const speciesScoped = unresolved.filter((d) => d.scope === 'species');
    expect(speciesScoped.map((d) => d.decisionId)).toEqual([
      'variant-human/ability-1',
      'variant-human/ability-2',
      'variant-human/skill',
    ]);
  });

  it('treats a species decision as resolved once recorded on the species', () => {
    const character = fighterCharacter({});
    character.build.species = {
      ref: '2014/species/variant-human',
      decisions: [{ decisionId: 'variant-human/skill', choice: ['athletics'] }],
    };
    const unresolved = unresolvedDecisions(character, index);
    expect(unresolved.find((d) => d.decisionId === 'variant-human/skill')).toBeUndefined();
  });

  it("resolves the High Elf bonus cantrip via optionQuery and grants the chosen spell", () => {
    // The decision point resolves its wizard-cantrip options from the spell list, not a hand-written list.
    const wizardCantrips = resolveOptionQuery('spell:0:wizard', index);
    expect(wizardCantrips.length).toBeGreaterThan(0);
    expect(wizardCantrips).toContain('2014/spell/fire-bolt');

    const character = fighterCharacter({});
    character.build.species = { ref: '2014/species/high-elf', decisions: [] };
    const unresolved = unresolvedDecisions(character, index);
    const cantripDecision = unresolved.find((d) => d.decisionId === '2014/species/high-elf/cantrip');
    expect(cantripDecision).toBeDefined();
    expect(cantripDecision!.options).toContain('2014/spell/fire-bolt');

    // Once chosen, the cantrip shows up as an always-available granted spell, not against the class cap.
    character.build.species.decisions = [{ decisionId: '2014/species/high-elf/cantrip', choice: ['2014/spell/fire-bolt'] }];
    const sheet = computeSheet(character, index);
    expect(sheet.grantedSpellRefs).toContain('2014/spell/fire-bolt');
  });

  it('applies Half-Elf ability and skill choices to the computed sheet', () => {
    const character = fighterCharacter({});
    character.build.species = {
      ref: '2014/species/half-elf',
      decisions: [
        { decisionId: 'half-elf/ability', choice: ['str', 'dex'] },
        { decisionId: 'half-elf/skill', choice: ['stealth', 'arcana'] },
      ],
    };
    const before = computeSheet({ ...character, build: { ...character.build, species: { ref: '2014/species/half-elf', decisions: [] } } }, index);
    const after = computeSheet(character, index);
    // +1 STR and +1 DEX from the two chosen abilities (Cha's fixed +2 is unaffected).
    expect(after.abilities.str.score).toBe(before.abilities.str.score + 1);
    expect(after.abilities.dex.score).toBe(before.abilities.dex.score + 1);
    // The two chosen skills are now proficient.
    expect(after.skills.stealth?.proficient).toBe(true);
    expect(after.skills.arcana?.proficient).toBe(true);
  });

  it('applies a Dwarf tool-proficiency choice', () => {
    const character = fighterCharacter({});
    character.build.species = {
      ref: '2014/species/hill-dwarf',
      decisions: [{ decisionId: 'dwarf/tool', choice: ['smiths-tools'] }],
    };
    const sheet = computeSheet(character, index);
    expect(sheet.proficiencies.tools).toContain('smiths-tools');
  });

  it('surfaces Half-Elf ability and skill decisions as unresolved', () => {
    const character = fighterCharacter({});
    character.build.species = { ref: '2014/species/half-elf', decisions: [] };
    const ids = unresolvedDecisions(character, index)
      .filter((d) => d.scope === 'species')
      .map((d) => d.decisionId);
    expect(ids).toContain('half-elf/ability');
    expect(ids).toContain('half-elf/skill');
  });

  it('enumerates decision points declared by a subclass', () => {
    const character = fighterCharacter({});
    character.build.classes[0].subclassRef = '2014/subclass/champion';
    const patched = new Map(index);
    const champion = patched.get('2014/subclass/champion');
    if (champion?.kind !== 'subclass') throw new Error('fixture assumption broken: champion missing');
    patched.set(champion.id, {
      ...champion,
      data: {
        ...champion.data,
        decisionPoints: [{ decisionId: 'champion/test-choice', prompt: 'Pick one', count: 1, options: ['a', 'b'] }],
      },
    });

    const all = enumerateDecisions(character, patched);
    expect(all).toContainEqual(
      expect.objectContaining({ decisionId: 'champion/test-choice', scope: 'subclass' }),
    );
  });
});
