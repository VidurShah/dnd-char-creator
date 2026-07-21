import type { ContentEntry } from '@/schema/content';
import type { Edition } from '@/schema/common';
import { getClassGuidance } from '@/content/guidance';
import { humanizeCamel } from '@/lib/text';

/** A compact, catalog the model picks real ids from — never sent the full content payloads, just enough to choose sensibly. */
export function buildCatalog(entries: ContentEntry[], edition: Edition): string {
  const species = entries.filter((e): e is Extract<ContentEntry, { kind: 'species' }> => e.kind === 'species');
  const classes = entries.filter((e): e is Extract<ContentEntry, { kind: 'class' }> => e.kind === 'class');
  const subclasses = entries.filter((e): e is Extract<ContentEntry, { kind: 'subclass' }> => e.kind === 'subclass');
  const backgrounds = entries.filter((e): e is Extract<ContentEntry, { kind: 'background' }> => e.kind === 'background');

  const lines: string[] = [];

  lines.push('## Species');
  for (const s of species) {
    lines.push(`- ${s.id} :: ${s.name} — Speed ${s.data.speed} ft, ${s.data.size} size`);
  }

  lines.push('', '## Classes');
  for (const c of classes) {
    const guidance = getClassGuidance(edition, c.id);
    const abilities = guidance ? ` — good abilities: ${guidance.recommendedAbilities.map((a) => a.toUpperCase()).join('/')}` : '';
    lines.push(`- ${c.id} :: ${c.name} — hit die ${c.data.hitDie}${c.data.spellcasting ? ', spellcaster' : ''}${abilities}`);
  }

  lines.push('', '## Subclasses (subclassRef must belong to the chosen classRef)');
  for (const s of subclasses) {
    const desc = (s.data.description ?? '').replace(/\s+/g, ' ').slice(0, 140);
    lines.push(`- ${s.id} :: ${s.name} (of ${s.data.parentClassRef}) — ${desc}`);
  }

  lines.push('', '## Backgrounds');
  for (const b of backgrounds) {
    lines.push(`- ${b.id} :: ${b.name} — skills: ${b.data.skillProficiencies.map(humanizeCamel).join(', ')}`);
  }

  return lines.join('\n');
}
