import { beforeAll, describe, expect, it } from 'vitest';
import { loadContentIndex } from '@/content/loader';
import type { ContentEntry } from '@/schema/content';
import { emptyBuilderState, type BuilderState } from './builder/builderState';
import { buildCharacter } from './characterFactory';

let byId: Map<string, ContentEntry>;
let items: ContentEntry[];

beforeAll(async () => {
  const entries = await loadContentIndex('2014');
  byId = new Map(entries.map((e) => [e.id, e]));
  items = entries.filter((e) => e.kind === 'item');
});

function state(overrides: Partial<BuilderState>): BuilderState {
  return { ...emptyBuilderState(), ...overrides };
}

describe('buildCharacter — decision routing', () => {
  // Regression: species decisions were hardcoded to [], so a Variant Human's
  // ability/skill picks were written into the class's decisionsByLevel instead.
  // Because changing class resets classDecisions, that silently erased them.
  it('records species decisions on the species, not the class', () => {
    const character = buildCharacter(
      state({
        speciesRef: '2014/species/variant-human',
        speciesDecisions: [
          { decisionId: 'variant-human/ability-1', choice: ['str'] },
          { decisionId: 'variant-human/skill', choice: ['athletics'] },
        ],
        classRef: '2014/class/fighter',
        classDecisions: [{ decisionId: 'fighter/skills', choice: ['acrobatics', 'perception'] }],
        backgroundRef: '2014/background/acolyte',
      }),
      items,
      byId,
    );

    expect(character.build.species.decisions).toHaveLength(2);
    expect(character.build.species.decisions.map((d) => d.decisionId)).toEqual([
      'variant-human/ability-1',
      'variant-human/skill',
    ]);
    // The class keeps only its own answers.
    const classDecisions = character.build.classes[0].decisionsByLevel['1'];
    expect(classDecisions.map((d) => d.decisionId)).toEqual(['fighter/skills']);
  });

  it('leaves species decisions empty when the species declares none', () => {
    const character = buildCharacter(
      state({ speciesRef: '2014/species/dragonborn', backgroundRef: '2014/background/acolyte' }),
      items,
      byId,
    );
    expect(character.build.species.decisions).toEqual([]);
  });
});
