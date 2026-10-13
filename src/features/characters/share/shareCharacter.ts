import type { Character } from '@/schema/character';
import type { ContentEntry } from '@/schema/content';
import { SKILL_ABILITY, type DerivedSheet } from '@/engine/compute';
import type { Skill } from '@/schema/common';
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
  /**
   * Structured facts for the printable sheet, which lays out what the
   * Markdown above flattens into lines: every skill rather than only the
   * proficient ones, slots and resources as boxes to tick, and blanks where
   * play-time state gets written in pencil.
   */
  print: {
    level: number;
    edition: string;
    identity: string;
    combat: { label: string; value: string }[];
    hp: { max: number; current: number };
    hitDice: { die: string; count: number }[];
    saves: { label: string; mod: string; proficient: boolean }[];
    skills: { name: string; ability: string; mod: string; proficient: boolean }[];
    resources: { name: string; max: number; recharge: string }[];
    coins: { coin: string; amount: number }[];
    slots: { label: string; count: number }[];
    spells: { label: string; items: { name: string; alwaysPrepared: boolean }[] }[];
  };
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

  const abbrev = (a: keyof typeof ABILITY_LABEL) => ABILITY_LABEL[a].slice(0, 3).toUpperCase();

  const hitDice = new Map<string, number>();
  for (const c of character.build.classes) {
    const entry = index.get(c.classRef);
    if (entry?.kind === 'class') hitDice.set(entry.data.hitDie, (hitDice.get(entry.data.hitDie) ?? 0) + c.levels);
  }

  const slots: { label: string; count: number }[] = [];
  if (sheet.spellcasting) {
    sheet.spellcasting.slots.forEach((count, lvl) => {
      if (lvl >= 1 && count > 0) slots.push({ label: `Level ${lvl}`, count });
    });
    const pact = sheet.spellcasting.pactSlots;
    if (pact) slots.push({ label: `Pact (level ${pact.level}, short rest)`, count: pact.count });
  }

  const printSpells = [...byLevel.keys()]
    .sort((a, b) => a - b)
    .map((level) => {
      const items = spellRefs
        .map((ref) => index.get(ref))
        .filter((e): e is Extract<ContentEntry, { kind: 'spell' }> => e?.kind === 'spell' && e.data.level === level)
        .map((e) => ({ name: e.name, alwaysPrepared: grantedSet.has(e.id) }))
        .sort((a, b) => a.name.localeCompare(b.name));
      return { label: level === 0 ? 'Cantrips' : `Level ${level}`, items };
    });

  const print: ShareModel['print'] = {
    level: sheet.totalLevel,
    edition: editionLabel,
    identity: [species, classLine || undefined, background ? `${background} background` : undefined].filter(Boolean).join(' · '),
    combat: [
      { label: 'Armor Class', value: String(sheet.ac.value) },
      { label: 'Initiative', value: mod(sheet.initiative) },
      { label: 'Speed', value: `${sheet.speed} ft` },
      { label: 'Proficiency', value: mod(sheet.proficiencyBonus) },
      { label: 'Passive Perception', value: String(sheet.passivePerception) },
    ],
    hp: { max: sheet.hp.max, current: character.state.hp.current },
    hitDice: [...hitDice.entries()].map(([die, count]) => ({ die, count })),
    saves: ABILITY_ORDER.map((a) => ({ label: abbrev(a), mod: mod(sheet.savingThrows[a].mod), proficient: sheet.savingThrows[a].proficient })),
    skills: (Object.keys(SKILL_ABILITY) as Skill[])
      .map((skill) => ({
        name: humanizeSkill(skill),
        ability: abbrev(SKILL_ABILITY[skill]),
        mod: mod(sheet.skills[skill]?.mod ?? 0),
        proficient: sheet.skills[skill]?.proficient ?? false,
      }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    resources: sheet.resources.map((r) => ({
      name: r.label,
      max: r.max,
      recharge: r.recharge === 'short' ? 'short rest' : r.recharge === 'long' ? 'long rest' : '',
    })),
    coins: (['pp', 'gp', 'ep', 'sp', 'cp'] as const).map((coin) => ({ coin: coin.toUpperCase(), amount: cur[coin] })),
    slots,
    spells: printSpells,
  };

  return { name: character.name, subtitle, vitals, abilities, saves, skills, otherProficiencies, attacks, spellcasting, spells, features, inventory, currency, lore, print };
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

/** `n` empty checkboxes, for ticking off slots, uses, and hit dice in pencil. */
function boxes(n: number): string {
  return n > 0 ? `<span class="boxes">${'<i></i>'.repeat(Math.min(n, 20))}</span>` : '';
}

function dot(filled: boolean): string {
  return `<span class="dot${filled ? ' on' : ''}"></span>`;
}

export interface ShareHtmlOptions {
  /**
   * Append the full text of every feature and the roleplay notes after the
   * sheet. Defaults on for the downloaded file, which should be complete; the
   * print button lets the player leave it off to keep a level-1 sheet on one
   * page.
   */
  includeReference?: boolean;
}

/**
 * A self-contained HTML character sheet, laid out to print like one.
 *
 * Page 1 is the sheet a player keeps on the table: abilities, saves and every
 * skill, combat numbers, attacks, features with uses to tick, equipment and
 * coin — with blank boxes for current HP, temp HP and notes, since the point
 * of paper is writing on it. Spellcasters get a second page with slots to tick
 * and the spell list with prepared boxes. The optional reference pages carry
 * full feature text.
 *
 * Print-to-PDF from the browser is the delivery mechanism, so it needs no PDF
 * library, no network, and no script: it prints the same offline.
 */
export function shareModelToHtml(m: ShareModel, { includeReference = true }: ShareHtmlOptions = {}): string {
  const p = m.print;

  const abilities = m.abilities
    .map(
      (a) =>
        `<div class="ability"><div class="lbl">${esc(a.label.slice(0, 3).toUpperCase())}</div><div class="mod">${esc(a.mod)}</div><div class="score">${a.score}</div></div>`,
    )
    .join('');

  const saves = p.saves
    .map((sv) => `<li>${dot(sv.proficient)}<span class="name">${esc(sv.label)}</span><span class="num">${esc(sv.mod)}</span></li>`)
    .join('');

  const skills = p.skills
    .map(
      (sk) =>
        `<li>${dot(sk.proficient)}<span class="name">${esc(sk.name)} <small>${esc(sk.ability)}</small></span><span class="num">${esc(sk.mod)}</span></li>`,
    )
    .join('');

  const combat = p.combat.map((c) => `<div class="stat"><div class="v">${esc(c.value)}</div><div class="lbl">${esc(c.label)}</div></div>`).join('');

  const hitDice = p.hitDice.map((h) => `<span class="hd">${h.count}${esc(h.die)} ${boxes(h.count)}</span>`).join(' ');

  const attacks = m.attacks.length
    ? `<table class="attacks"><thead><tr><th>Attack</th><th>To hit</th><th>Damage</th></tr></thead><tbody>${m.attacks
        .map((a) => `<tr><td>${esc(a.name)}</td><td>${esc(a.attack)}</td><td>${esc(a.damage)}</td></tr>`)
        .join('')}</tbody></table>`
    : '<p class="muted">No attacks.</p>';

  const resources = p.resources
    .map((r) => `<li><b>${esc(r.name)}</b> ${boxes(r.max)}${r.recharge ? ` <small>/ ${esc(r.recharge)}</small>` : ''}</li>`)
    .join('');
  const featureNames = m.features
    .flatMap((g) => g.items.map((f) => f.name))
    .filter((name, i, all) => all.indexOf(name) === i)
    .map((name) => `<li>${esc(name)}</li>`)
    .join('');

  const equipment = m.inventory.map((i) => `<li>${esc(i)}</li>`).join('');
  const coins = p.coins.map((c) => `<div class="coin"><div class="lbl">${c.coin}</div><div class="v">${c.amount || ''}</div></div>`).join('');

  const proficiencies = m.otherProficiencies.map((x) => `<p><b>${esc(x.label)}:</b> ${esc(x.value)}</p>`).join('');

  const spellPage =
    m.spellcasting || p.spells.length
      ? `<section class="page">
  <header class="sheet-head"><h1>${esc(m.name)}</h1><p class="ident">Spellcasting</p></header>
  ${m.spellcasting ? `<div class="box"><p class="caster">${esc(m.spellcasting.line)}</p></div>` : ''}
  ${
    p.slots.length
      ? `<div class="box"><h2>Spell slots</h2><ul class="slots">${p.slots
          .map((sl) => `<li><span class="name">${esc(sl.label)}</span>${boxes(sl.count)}</li>`)
          .join('')}</ul></div>`
      : ''
  }
  <div class="spell-cols">${p.spells
    .map(
      (g) =>
        `<div class="box keep"><h2>${esc(g.label)}</h2><ul class="spells">${g.items
          // Cantrips are always known, so they get no prepared box.
          .map((sp) => `<li>${sp.alwaysPrepared ? dot(true) : g.label === 'Cantrips' ? '' : '<i class="check"></i>'}${esc(sp.name)}</li>`)
          .join('')}</ul></div>`,
    )
    .join('')}</div>
  <p class="legend">${dot(true)} always prepared · <i class="check"></i> tick the ones you have prepared</p>
</section>`
      : '';

  const referencePage =
    includeReference && (m.features.length || m.lore.length)
      ? `<section class="page reference">
  <header class="sheet-head"><h1>${esc(m.name)}</h1><p class="ident">Features &amp; traits</p></header>
  ${m.features
    .map(
      (g) =>
        `<h2>${esc(g.section)}</h2>${g.items
          .map((f) => `<div class="keep feat"><h3>${esc(f.name)}</h3>${f.description ? `<p>${esc(f.description)}</p>` : ''}</div>`)
          .join('')}`,
    )
    .join('')}
  ${m.lore.length ? `<h2>Roleplay</h2>${m.lore.map((l) => `<div class="keep feat"><h3>${esc(l.label)}</h3><p>${esc(l.value)}</p></div>`).join('')}` : ''}
</section>`
      : '';

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(m.name)} — character sheet</title>
<style>
  /* One fixed paper look, on screen and in print: this page is a sheet, not an app. */
  :root { --ink:#1f1b16; --muted:#6b6257; --line:#1f1b16; --soft:#c9bfae; --paper:#fffdf8; --desk:#e9e2d3; }
  * { box-sizing:border-box; }
  html { -webkit-print-color-adjust:exact; print-color-adjust:exact; }
  body { margin:0; background:var(--desk); color:var(--ink); font:10pt/1.35 ui-serif,Georgia,'Times New Roman',serif; }
  /* 186mm fits inside both A4 and US Letter at 12mm margins, so one layout prints on either. */
  .page { width:186mm; margin:12mm auto; padding:8mm; background:var(--paper); box-shadow:0 1px 6px rgba(0,0,0,.15); }
  @media screen and (max-width: 800px) { .page { width:auto; margin:12px; padding:14px; } }
  h1 { margin:0; font-size:20pt; line-height:1.1; }
  h2 { margin:0 0 1.5mm; font:700 7.5pt/1.2 ui-sans-serif,system-ui,sans-serif; text-transform:uppercase; letter-spacing:.08em; color:var(--muted); }
  h3 { margin:0; font-size:10pt; }
  p { margin:1mm 0; }
  ul { list-style:none; margin:0; padding:0; }
  small, .muted { color:var(--muted); }
  .sheet-head { display:flex; justify-content:space-between; align-items:flex-end; gap:6mm; border-bottom:1.5pt solid var(--line); padding-bottom:2mm; margin-bottom:3mm; }
  .ident { margin:0; text-align:right; color:var(--muted); font-size:9pt; }
  .ident b { color:var(--ink); }
  .box { border:1pt solid var(--line); border-radius:1.5mm; padding:2mm 2.5mm; }
  .keep, .box { break-inside:avoid; page-break-inside:avoid; }

  .grid { display:grid; grid-template-columns:24mm 1fr 1fr; gap:3mm; }
  .abilities { display:flex; flex-direction:column; gap:2mm; }
  .ability { border:1pt solid var(--line); border-radius:1.5mm; text-align:center; padding:.8mm 0 1.2mm; }
  .ability .lbl, .stat .lbl, .coin .lbl { font:700 6.5pt ui-sans-serif,system-ui,sans-serif; letter-spacing:.08em; color:var(--muted); text-transform:uppercase; }
  .ability .mod { font-size:16pt; font-weight:700; line-height:1.1; }
  .ability .score { display:inline-block; min-width:9mm; border:1pt solid var(--soft); border-radius:3mm; font-size:8.5pt; }
  .col { display:flex; flex-direction:column; gap:3mm; min-width:0; }

  .stats { display:grid; grid-template-columns:repeat(5,1fr); gap:2mm; }
  .stat { border:1pt solid var(--line); border-radius:1.5mm; text-align:center; padding:1.5mm .5mm; }
  .stat .v { font-size:12pt; font-weight:700; white-space:nowrap; }
  .hp { display:grid; grid-template-columns:1fr 1fr; gap:2mm; }
  .write { border:1pt solid var(--line); border-radius:1.5mm; padding:1.5mm 2mm; min-height:15mm; }
  .write .lbl { font:700 6.5pt ui-sans-serif,system-ui,sans-serif; letter-spacing:.08em; color:var(--muted); text-transform:uppercase; }
  .pencil { color:var(--soft); font-size:8pt; }
  .hd { white-space:nowrap; margin-right:3mm; }

  .checks li { display:flex; align-items:center; gap:1.5mm; padding:0; border-bottom:.5pt dotted var(--soft); }
  .checks .name { flex:1; }
  .checks .num { font-weight:700; min-width:7mm; text-align:right; }
  .two { columns:2; column-gap:4mm; }
  .two li { break-inside:avoid; }
  .dot { display:inline-block; width:2.4mm; height:2.4mm; border:.8pt solid var(--line); border-radius:50%; flex:none; }
  .dot.on { background:var(--line); }
  .boxes { display:inline-flex; gap:.8mm; vertical-align:middle; }
  .boxes i, i.check { display:inline-block; width:2.8mm; height:2.8mm; border:.8pt solid var(--line); flex:none; }
  i.check { margin-right:1.5mm; vertical-align:-.4mm; }

  table.attacks { width:100%; border-collapse:collapse; }
  .attacks th { text-align:left; font:700 6.5pt ui-sans-serif,system-ui,sans-serif; letter-spacing:.08em; color:var(--muted); text-transform:uppercase; border-bottom:1pt solid var(--line); }
  .attacks td { padding:.6mm 0; border-bottom:.5pt dotted var(--soft); }
  .attacks td:nth-child(2) { font-weight:700; width:12mm; }

  .lower { display:grid; grid-template-columns:1fr 1fr; gap:3mm; margin-top:3mm; }
  .feats li, .equip li { padding:0; border-bottom:.5pt dotted var(--soft); }
  .coins { display:grid; grid-template-columns:repeat(5,1fr); gap:1.5mm; margin-top:2mm; }
  .coin { border:1pt solid var(--line); border-radius:1.5mm; text-align:center; min-height:9mm; }
  .coin .v { font-size:9pt; }
  .notes { min-height:42mm; background:repeating-linear-gradient(transparent 0 6.5mm, var(--soft) 6.5mm calc(6.5mm + .5pt)); }
  .profs { margin-top:3mm; font-size:8.5pt; }

  .caster { font-weight:700; margin:0; }
  .slots li { display:flex; align-items:center; gap:3mm; padding:.6mm 0; }
  .slots .name { min-width:45mm; }
  .spell-cols { columns:2; column-gap:3mm; margin-top:3mm; }
  .spell-cols .box { margin-bottom:3mm; }
  .spells li { padding:.4mm 0; border-bottom:.5pt dotted var(--soft); display:flex; align-items:center; gap:1.5mm; }
  .legend { color:var(--muted); font-size:8pt; }
  .page > .box { margin-top:3mm; }

  .reference h2 { margin-top:4mm; }
  .reference .feat { margin:0 0 2.5mm; }
  .reference .feat p { white-space:pre-line; font-size:9pt; }

  @page { size:auto; margin:12mm; }
  @media print {
    body { background:none; }
    .page { width:auto; margin:0; padding:0; box-shadow:none; }
    .page + .page { break-before:page; page-break-before:always; }
  }
</style></head>
<body>
<section class="page">
  <header class="sheet-head">
    <div><h1>${esc(m.name)}</h1></div>
    <p class="ident"><b>${esc(p.identity)}</b><br>Level ${p.level} · ${esc(p.edition)}</p>
  </header>
  <div class="grid">
    <div class="abilities">${abilities}</div>
    <div class="col">
      <div class="box"><h2>Saving throws</h2><ul class="checks">${saves}</ul></div>
      <div class="box"><h2>Skills</h2><ul class="checks">${skills}</ul></div>
    </div>
    <div class="col">
      <div class="stats">${combat}</div>
      <div class="hp">
        <div class="write"><div class="lbl">Current HP</div><div class="pencil">max ${p.hp.max}</div></div>
        <div class="write"><div class="lbl">Temp HP</div></div>
      </div>
      <div class="box"><h2>Hit dice</h2>${hitDice || '<span class="muted">—</span>'}
        <h2 style="margin-top:2mm">Death saves</h2>
        <span class="hd">Successes ${boxes(3)}</span> <span class="hd">Failures ${boxes(3)}</span>
      </div>
      <div class="box keep"><h2>Attacks</h2>${attacks}</div>
      <div class="box keep"><h2>Features &amp; traits</h2>
        ${resources ? `<ul class="feats">${resources}</ul>` : ''}
        <ul class="feats two">${featureNames}</ul>
      </div>
    </div>
  </div>
  <div class="lower">
    <div class="box keep"><h2>Equipment</h2>
      <ul class="equip two">${equipment || '<li class="muted">—</li>'}</ul>
      <div class="coins">${coins}</div>
    </div>
    <div class="box notes keep"><h2>Notes</h2></div>
  </div>
  ${proficiencies ? `<div class="profs">${proficiencies}</div>` : ''}
</section>
${spellPage}
${referencePage}
</body></html>`;
}
