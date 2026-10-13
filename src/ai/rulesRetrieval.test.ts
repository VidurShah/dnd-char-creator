import { describe, expect, it } from 'vitest';
import type { ContentEntry } from '@/schema/content';
import spells2014 from '@data/2014/spells.json';
import conditions2014 from '@data/2014/conditions.json';
import features2014 from '@data/2014/features.json';
import feats2014 from '@data/2014/feats.json';
import items2014 from '@data/2014/items.json';
import barbarian2014 from '@data/2014/classes/barbarian.json';
import rogue2014 from '@data/2014/classes/rogue.json';
import conditions2024 from '@data/2024/conditions.json';
import { buildRulesIndex, entryPromptText } from './rulesRetrieval';

/** Real seed content: retrieval quality is only meaningful against the actual names and their collisions. */
const entries2014 = [spells2014, conditions2014, features2014, feats2014, items2014, barbarian2014, rogue2014].flat() as ContentEntry[];
const index = buildRulesIndex(entries2014, '2014');
const names = (message: string) => index.retrieve(message).map((e) => e.name);

describe('buildRulesIndex', () => {
  it('finds the condition and the spell in the issue’s own example', () => {
    const found = names("I'm grappled. Can I still cast Misty Step?");
    expect(found.slice(0, 2).sort()).toEqual(['Grappled', 'Misty Step']);
  });

  it('matches names typed in lowercase, the way players actually type them', () => {
    expect(names('what does prone do to ranged attacks')).toContain('Prone');
    expect(names('does counterspell need line of sight')).toContain('Counterspell');
    expect(names('can I cast fireball while concentrating on haste').sort()).toEqual(['Fireball', 'Haste']);
  });

  it('needs a capital for names that are everyday words', () => {
    // "light armor" is not a question about the Light cantrip...
    expect(names('can I cast spells in light armor')).not.toContain('Light');
    // ...but a capitalized mention is a deliberate reference.
    expect(names('what does Light actually illuminate')).toContain('Light');
  });

  it('prefers the longer name when one contains another', () => {
    const found = names('How long does Greater Invisibility last?');
    expect(found[0]).toBe('Greater Invisibility');
    expect(found).not.toContain('Invisibility');
  });

  it('falls back to a name search when the name is not a phrase match', () => {
    expect(names('how does rage work')).toContain('Rage');
    expect(names('can I sneak attack with a spell')).toContain('Sneak Attack');
  });

  it('returns nothing rather than noise for a question with no rules terms', () => {
    expect(names('what should I do next?')).toEqual([]);
  });

  it('prefers the entry the character actually has when names collide', () => {
    const rages = entries2014.filter((e) => e.name === 'Rage');
    if (rages.length < 2) return; // nothing to disambiguate in this data
    const owned = rages[rages.length - 1];
    const found = index.retrieve('When do I use Rage?', { preferIds: new Set([owned.id]) });
    expect(found[0].id).toBe(owned.id);
  });

  it('never crosses editions, even when handed a mixed list', () => {
    const mixed = buildRulesIndex([...entries2014, ...(conditions2024 as ContentEntry[])], '2014');
    const found = mixed.retrieve('what does grappled do');
    expect(found.map((e) => e.edition)).toEqual(['2014']);
  });

  it('caps the number of entries', () => {
    expect(index.retrieve('Grappled Prone Restrained Stunned Poisoned Blinded Charmed', { limit: 3 })).toHaveLength(3);
  });
});

describe('entryPromptText', () => {
  it('includes the casting facts a rules answer hinges on', () => {
    const mistyStep = entries2014.find((e) => e.id === '2014/spell/misty-step')!;
    expect(entryPromptText(mistyStep)).toMatch(/Casting time: 1 bonus action\. Range: Self/);
  });
});
