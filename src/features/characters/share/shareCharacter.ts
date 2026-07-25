import type { Character } from '@/schema/character';
import type { ContentEntry } from '@/schema/content';
import type { DerivedSheet } from '@/engine/compute';
import { ABILITY_LABEL, ABILITY_ORDER } from '../builder/builderState';
import { humanizeSkill, humanizeSlug } from '@/lib/text';

function mod(n: number): string {
  return n >= 0 ? `+${n}` : `${n}`;
}

function nameOf(index: Map<string, ContentEntry>, ref: string | undefined, fallbackFromSlug = true): string | undefined {
  if (!ref) return undefined;
  const entry = index.get(ref);
  if (entry) return entry.name;
  return fallbackFromSlug ? humanizeSlug(ref.split('/').pop() ?? ref) : undefined;
}

/** Display-ready view of a single character, rendered to Markdown or HTML for sharing. */
export interface ShareModel {
  name: string;
  subtitle: string;
  vitals: { label: string; value: string }[];
  abilities: { label: string; score: number; mod: string }[];
  saves: string;
  skills: string;
  otherProficiencies: { label: string; value: string }[];
  attacks: { name: string; attack: string; damage: string }[];
  spellcasting?: { line: string; slots: string };
  spells: { level: number; label: string; names: string[] }[];
  features: { section: string; items: { name: string; description: string }[] }[];
  inventory: string[];
  currency?: string;
  lore: { label: string; value: string }[];
}

const SECTION_LABEL: Record<string, string> = {
  class: 'Class Features',
  subclass: 'Subclass',
  species: 'Species Traits',
  background: 'Background',
  feat: 'Feats',
};

export function buildShareModel(character: Character, sheet: DerivedSheet, index: Map<string, ContentEntry>): ShareModel {
  const classLine = character.build.classes
    .map((c) => {
      const cn = nameOf(index, c.classRef) ?? c.classRef;
      const sub = c.subclassRef ? nameOf(index, c.subclassRef) : undefined;
      return sub ? `${cn} ${c.levels} (${sub})` : `${cn} ${c.levels}`;
    })
    .join(' / ');
  const species = nameOf(index, character.build.species.ref);
  const background = nameOf(index, character.build.background.ref);
  const editionLabel = character.edition === '2014' ? "5e (2014)" : '5.5e (2024)';

  const subtitleParts = [`Level ${sheet.totalLevel}`, species, classLine || undefined, background ? `${background} background` : undefined];
  const subtitle = subtitleParts.filter(Boolean).join(' · ');

  const vitals: { label: string; value: string }[] = [
    { label: 'AC', value: String(sheet.ac.value) },
    { label: 'HP', value: `${character.state.hp.current} / ${sheet.hp.max}` },
    { label: 'Speed', value: `${sheet.speed} ft` },
    { label: 'Initiative', value: mod(sheet.initiative) },
    { label: 'Prof. Bonus', value: mod(sheet.proficiencyBonus) },
    { label: 'Passive Perception', value: String(sheet.passivePerception) },
    { label: 'Edition', value: editionLabel },
  ];

  const abilities = ABILITY_ORDER.map((a) => ({
    label: ABILITY_LABEL[a],
    score: sheet.abilities[a].score,
    mod: mod(sheet.abilities[a].mod),
  }));

  const saves = ABILITY_ORDER.map((a) => `${ABILITY_LABEL[a].slice(0, 3)} ${mod(sheet.savingThrows[a].mod)}${sheet.savingThrows[a].proficient ? '*' : ''}`).join(', ');

  const proficientSkills = (Object.entries(sheet.skills) as [string, { mod: number; proficient: boolean }][])
    .filter(([, s]) => s.proficient)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([skill, s]) => `${humanizeSkill(skill)} ${mod(s.mod)}`);
  const skills = proficientSkills.length ? proficientSkills.join(', ') : 'None';

  const otherProficiencies: { label: string; value: string }[] = [];
  if (character.state.languages.trim()) otherProficiencies.push({ label: 'Languages', value: character.state.languages.trim() });
  if (sheet.senses.length) otherProficiencies.push({ label: 'Senses', value: sheet.senses.map((s) => `${humanizeSlug(s.sense)} ${s.range} ft`).join(', ') });
  if (sheet.resistances.length) otherProficiencies.push({ label: 'Resistances', value: sheet.resistances.map(humanizeSlug).join(', ') });
  const weapons = sheet.proficiencies.weapons.map(humanizeSlug);
  const armor = sheet.proficiencies.armor.map(humanizeSlug);
  const tools = sheet.proficiencies.tools.map(humanizeSlug);
  if (weapons.length) otherProficiencies.push({ label: 'Weapons', value: weapons.join(', ') });
  if (armor.length) otherProficiencies.push({ label: 'Armor', value: armor.join(', ') });
  if (tools.length) otherProficiencies.push({ label: 'Tools', value: tools.join(', ') });

  const attacks = sheet.attacks.map((atk) => ({
    name: atk.name,
    attack: mod(atk.attackBonus),
    damage: `${atk.damageDice}${atk.damageBonus ? mod(atk.damageBonus) : ''} ${humanizeSlug(atk.damageType)}`.trim(),
  }));

  let spellcasting: ShareModel['spellcasting'];
  if (sheet.spellcasting) {
    const sc = sheet.spellcasting;
    const slotStr = sc.slots
      .map((count, lvl) => (lvl >= 1 && count > 0 ? `L${lvl}: ${count}` : null))
      .filter(Boolean)
      .join(' · ');
    const pact = sc.pactSlots ? ` · Pact ${sc.pactSlots.count}×L${sc.pactSlots.level}` : '';
    spellcasting = {
      line: `Save DC ${sc.saveDc} · Attack ${mod(sc.attackBonus)} · Cantrips known ${sc.cantripsKnown}`,
      slots: (slotStr || 'None') + pact,
    };
  }

  const grantedSet = new Set(sheet.grantedSpellRefs);
  const spellRefs = [...new Set([...character.build.knownSpells, ...sheet.grantedSpellRefs])];
  const byLevel = new Map<number, string[]>();
  for (const ref of spellRefs) {
    const e = index.get(ref);
    if (e?.kind !== 'spell') continue;
    const label = grantedSet.has(ref) ? `${e.name} (always prepared)` : e.name;
    const arr = byLevel.get(e.data.level) ?? [];
    arr.push(label);
    byLevel.set(e.data.level, arr);
  }
  const spells = [...byLevel.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([level, names]) => ({
      level,
      label: level === 0 ? 'Cantrips' : `Level ${level}`,
      names: names.sort((a, b) => a.localeCompare(b)),
    }));

  const featureOrder = ['class', 'subclass', 'species', 'background', 'feat'];
  const features = featureOrder
    .map((section) => ({
      section: SECTION_LABEL[section] ?? section,
      items: sheet.features.filter((f) => f.source === section).map((f) => ({ name: f.name, description: f.description.trim() })),
    }))
    .filter((g) => g.items.length > 0);

  const inventory = character.state.inventory
    .map((i) => {
      const item = i.itemRef ? index.get(i.itemRef) : undefined;
      const nm = item?.name ?? (i.itemRef ? humanizeSlug(i.itemRef.split('/').pop() ?? i.itemRef) : 'Item');
      const qty = i.qty > 1 ? ` ×${i.qty}` : '';
      const eq = i.equipped ? ' (equipped)' : '';
      return `${nm}${qty}${eq}`;
    })
    .sort((a, b) => a.localeCompare(b));

  const cur = character.state.currency;
  const coins = (['pp', 'gp', 'ep', 'sp', 'cp'] as const).filter((k) => cur[k] > 0).map((k) => `${cur[k]} ${k}`);
  const currency = coins.length ? coins.join(', ') : undefined;

  const lore: { label: string; value: string }[] = [];
  const pushLore = (label: string, value: string) => {
    if (value.trim()) lore.push({ label, value: value.trim() });
  };
  pushLore('Alignment', character.state.alignment);
  pushLore('Personality', character.state.personalityTraits);
  pushLore('Ideals', character.state.ideals);
  pushLore('Bonds', character.state.bonds);
  pushLore('Flaws', character.state.flaws);
  pushLore('Backstory', character.state.notes);

  return { name: character.name, subtitle, vitals, abilities, saves, skills, otherProficiencies, attacks, spellcasting, spells, features, inventory, currency, lore };
}

// --- Markdown ---------------------------------------------------------------

export function shareModelToMarkdown(m: ShareModel): string {
  const lines: string[] = [];
  lines.push(`# ${m.name}`, '', `*${m.subtitle}*`, '');
  lines.push(m.vitals.map((v) => `**${v.label}:** ${v.value}`).join(' · '), '');

  lines.push('## Ability Scores', '');
  lines.push('| ' + m.abilities.map((a) => a.label.slice(0, 3)).join(' | ') + ' |');
  lines.push('| ' + m.abilities.map(() => '---').join(' | ') + ' |');
  lines.push('| ' + m.abilities.map((a) => `${a.score} (${a.mod})`).join(' | ') + ' |', '');

  lines.push(`**Saving Throws:** ${m.saves}  *(\\* = proficient)*`, '');
  lines.push(`**Skills:** ${m.skills}`, '');
  for (const p of m.otherProficiencies) lines.push(`**${p.label}:** ${p.value}  `);
  if (m.otherProficiencies.length) lines.push('');

  if (m.attacks.length) {
    lines.push('## Attacks', '');
    for (const a of m.attacks) lines.push(`- **${a.name}** — ${a.attack} to hit, ${a.damage}`);
    lines.push('');
  }

  if (m.spellcasting) {
    lines.push('## Spellcasting', '', m.spellcasting.line, '', `**Slots:** ${m.spellcasting.slots}`, '');
    for (const grp of m.spells) lines.push(`**${grp.label}:** ${grp.names.join(', ')}  `);
    if (m.spells.length) lines.push('');
  }

  if (m.features.length) {
    lines.push('## Features & Traits', '');
    for (const g of m.features) {
      lines.push(`### ${g.section}`, '');
      for (const f of g.items) lines.push(f.description ? `- **${f.name}** — ${f.description}` : `- **${f.name}**`);
      lines.push('');
    }
  }

  if (m.inventory.length || m.currency) {
    lines.push('## Equipment', '');
    for (const it of m.inventory) lines.push(`- ${it}`);
    if (m.currency) lines.push('', `**Coin:** ${m.currency}`);
    lines.push('');
  }

  if (m.lore.length) {
    lines.push('## Roleplay', '');
    for (const l of m.lore) lines.push(`**${l.label}:** ${l.value}`, '');
  }

  lines.push('---', '*Made with Grimoire.*');
  return lines.join('\n');
}

// --- HTML (self-contained, printable) --------------------------------------

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function shareModelToHtml(m: ShareModel): string {
  const abilityCells = m.abilities
    .map((a) => `<div class="stat"><div class="k">${esc(a.label)}</div><div class="v">${a.score}</div><div class="m">${esc(a.mod)}</div></div>`)
    .join('');
  const vitalCells = m.vitals.map((v) => `<div class="pill"><span class="pk">${esc(v.label)}</span><span class="pv">${esc(v.value)}</span></div>`).join('');
  const profRows = m.otherProficiencies.map((p) => `<p><b>${esc(p.label)}:</b> ${esc(p.value)}</p>`).join('');

  const attacks = m.attacks.length
    ? `<section><h2>Attacks</h2>${m.attacks
        .map((a) => `<p><b>${esc(a.name)}</b> — ${esc(a.attack)} to hit, ${esc(a.damage)}</p>`)
        .join('')}</section>`
    : '';

  const spellcasting = m.spellcasting
    ? `<section><h2>Spellcasting</h2><p>${esc(m.spellcasting.line)}</p><p><b>Slots:</b> ${esc(m.spellcasting.slots)}</p>${m.spells
        .map((g) => `<p><b>${esc(g.label)}:</b> ${esc(g.names.join(', '))}</p>`)
        .join('')}</section>`
    : '';

  const features = m.features.length
    ? `<section><h2>Features &amp; Traits</h2>${m.features
        .map(
          (g) =>
            `<h3>${esc(g.section)}</h3>${g.items
              .map((f) => `<details><summary>${esc(f.name)}</summary>${f.description ? `<p>${esc(f.description)}</p>` : ''}</details>`)
              .join('')}`,
        )
        .join('')}</section>`
    : '';

  const equipment =
    m.inventory.length || m.currency
      ? `<section><h2>Equipment</h2><ul>${m.inventory.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>${
          m.currency ? `<p><b>Coin:</b> ${esc(m.currency)}</p>` : ''
        }</section>`
      : '';

  const lore = m.lore.length
    ? `<section><h2>Roleplay</h2>${m.lore.map((l) => `<p><b>${esc(l.label)}:</b> ${esc(l.value)}</p>`).join('')}</section>`
    : '';

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(m.name)} — character sheet</title>
<style>
  :root { --ink:#2b2620; --kraft:#f4ecd8; --rust:#b5502f; --line:rgba(43,38,32,.18); }
  * { box-sizing: border-box; }
  body { margin:0; background:var(--kraft); color:var(--ink); font:16px/1.5 ui-serif,Georgia,'Times New Roman',serif; }
  .wrap { max-width: 800px; margin: 0 auto; padding: 2rem 1.25rem 3rem; }
  h1 { margin:0 0 .1rem; font-size: 2rem; }
  .subtitle { color: var(--rust); font-style: italic; margin: 0 0 1rem; }
  .pills { display:flex; flex-wrap:wrap; gap:.5rem; margin-bottom:1.25rem; }
  .pill { border:1px solid var(--line); padding:.25rem .6rem; font-size:.8rem; }
  .pk { text-transform:uppercase; letter-spacing:.04em; opacity:.6; margin-right:.4rem; }
  .pv { font-weight:600; }
  .stats { display:grid; grid-template-columns:repeat(6,1fr); gap:.5rem; margin:0 0 1.25rem; }
  .stat { border:2px solid var(--line); text-align:center; padding:.5rem .25rem; }
  .stat .k { font-size:.7rem; text-transform:uppercase; letter-spacing:.05em; opacity:.6; }
  .stat .v { font-size:1.5rem; font-weight:700; line-height:1.1; }
  .stat .m { font-size:.85rem; color:var(--rust); }
  section { margin-top:1.5rem; }
  h2 { font-size:1.15rem; border-bottom:2px solid var(--line); padding-bottom:.2rem; margin:0 0 .6rem; }
  h3 { font-size:.95rem; text-transform:uppercase; letter-spacing:.04em; opacity:.7; margin:1rem 0 .3rem; }
  p { margin:.35rem 0; }
  details { border-bottom:1px solid var(--line); padding:.3rem 0; }
  summary { cursor:pointer; font-weight:600; }
  details p { font-size:.9rem; opacity:.9; white-space:pre-line; margin:.4rem 0 .2rem 1rem; }
  ul { margin:.3rem 0; padding-left:1.2rem; }
  footer { margin-top:2rem; padding-top:.75rem; border-top:1px solid var(--line); font-size:.75rem; opacity:.55; }
  @media (prefers-color-scheme: dark) { :root { --ink:#e8dcc0; --kraft:#211d17; --line:rgba(232,220,192,.2); } }
  @media print { body { background:#fff; color:#000; } .pill,.stat { border-color:#999; } details[open] summary~* { display:block; } details:not([open]) > *:not(summary){ } }
</style></head>
<body><div class="wrap">
  <h1>${esc(m.name)}</h1>
  <p class="subtitle">${esc(m.subtitle)}</p>
  <div class="pills">${vitalCells}</div>
  <div class="stats">${abilityCells}</div>
  <section><h2>Proficiencies</h2>
    <p><b>Saving Throws:</b> ${esc(m.saves)} <span style="opacity:.6">(* = proficient)</span></p>
    <p><b>Skills:</b> ${esc(m.skills)}</p>
    ${profRows}
  </section>
  ${attacks}
  ${spellcasting}
  ${features}
  ${equipment}
  ${lore}
  <footer>Made with Grimoire.</footer>
</div></body></html>`;
}
