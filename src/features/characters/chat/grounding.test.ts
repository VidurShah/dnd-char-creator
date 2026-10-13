import { describe, expect, it } from 'vitest';
import type { ContentEntry } from '@/schema/content';
import spells2014 from '@data/2014/spells.json';
import conditions2014 from '@data/2014/conditions.json';
import { buildRulesIndex } from '@/ai/rulesRetrieval';
import { citedRefs, groundTurn, rulesPromptSection, type AdvisorMessage } from './grounding';

const entries = [spells2014, conditions2014].flat() as ContentEntry[];
const byId = new Map(entries.map((e) => [e.id, e]));
const rules = buildRulesIndex(entries, '2014');

const user = (text: string): AdvisorMessage => ({ role: 'user', text });

describe('groundTurn', () => {
  it('puts the real rules text in the prompt, numbered for citation', () => {
    const { sources, entries: found } = groundTurn([user("I'm grappled. Can I still cast Misty Step?")], rules, byId);
    expect(sources.map((s) => s.name).sort()).toEqual(['Grappled', 'Misty Step']);
    expect(sources.map((s) => s.ref).sort()).toEqual([1, 2]);

    const prompt = rulesPromptSection('2014', sources, found);
    expect(prompt).toMatch(/\[R\d\] Misty Step \(spell, level 2 conjuration\)/);
    expect(prompt).toMatch(/speed becomes 0/i);
  });

  it('keeps a ref meaning the same entry for the whole conversation', () => {
    const first = groundTurn([user('what does grappled do')], rules, byId);
    const history: AdvisorMessage[] = [
      user('what does grappled do'),
      { role: 'model', text: 'Your speed is 0 [R1].', sources: first.sources },
      user('and if I am also prone?'),
    ];
    const second = groundTurn(history, rules, byId);
    const ref = (name: string) => second.sources.find((s) => s.name === name)?.ref;

    expect(ref('Grappled')).toBe(1);
    // New entries continue the numbering instead of restarting at 1.
    expect(ref('Prone')).toBe(2);
  });

  it('carries the previous turn’s entries into a follow-up that names nothing', () => {
    const first = groundTurn([user('what does grappled do')], rules, byId);
    const second = groundTurn(
      [user('what does grappled do'), { role: 'model', text: '…', sources: first.sources }, user('how do I end it?')],
      rules,
      byId,
    );
    expect(second.sources.map((s) => s.name)).toEqual(['Grappled']);
  });

  it('tells the model to flag general knowledge when nothing matched', () => {
    const { sources, entries: found } = groundTurn([user('what is a good roleplay hook?')], rules, byId);
    expect(sources).toEqual([]);
    expect(rulesPromptSection('2014', sources, found)).toMatch(/general knowledge/);
  });
});

describe('citedRefs', () => {
  const sources = [
    { ref: 1, id: 'a', name: 'A', label: 'condition' },
    { ref: 2, id: 'b', name: 'B', label: 'condition' },
  ];

  it('collects single and grouped citations, ignoring refs that were never given', () => {
    expect([...citedRefs('Speed 0 [R1]. Also [R2, R9].', sources)].sort()).toEqual([1, 2]);
    expect(citedRefs('No markers here.', sources).size).toBe(0);
  });
});
