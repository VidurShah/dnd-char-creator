# Grimoire — engine & content conventions

Local-first D&D 5e (2014) / 5.5e (2024) character creator and play companion. See
`.claude/plans/gleaming-cooking-sedgewick.md` for the full project plan and phase
breakdown. This file is the load-bearing "how do we keep this from turning into an
unmaintainable rules engine" reference — read it before touching `src/engine/` or
`src/schema/`.

## The core discipline: closed Effect vocabulary + hardcode escape hatch

`src/schema/effects.ts`'s `EffectSchema` is a **closed, discriminated union** of
mechanical operations (`abilityBonus`, `acBonus`, `resistance`, `rollBonus`, etc.).
Content entries (species, feats, items, features) attach an optional `effects: Effect[]`
array that `computeSheet()` folds into the derived sheet.

**Rule: a mechanic needed by fewer than ~3 features gets hardcoded in
`src/engine/special.ts`'s `specialRules` registry (keyed by feature id), not a new
Effect op.** Growing the union for a one-off (e.g. Barbarian's Unarmored Defense using
Con instead of the usual AC math) is how rules engines rot into unmaintainable spaghetti.
`specialRules[featureId](ctx)` returns whatever ad-hoc contribution it needs (an AC
candidate, a resource, etc.) — it's an escape hatch, not a second effect system, so keep
each entry small and self-contained.

**Prose-only is a valid, permanent end state.** Every feature/feat/item renders its
description text regardless of whether it has any `effects`. Automation is progressive
enhancement layered on top, never a prerequisite for content to ship. Don't feel
obligated to mechanize something just because it's in the app — an unmechanized feature
that's still fully readable on the sheet is a fine place to stop.

### Effect ops: all 14 are consumed by `computeSheet()`

Every op in `EffectSchema` (`abilityBonus`, `abilityMax`, `proficiency`, `expertise`,
`acFormula`, `acBonus`, `speed`, `resource`, `spellcasting`, `grantSpell`, `resistance`,
`sense`, `rollBonus`, `hpBonus`) has real fold-in logic in `compute.ts` — see
`src/engine/computeEffects.test.ts` for a synthetic-effect test proving each one. A few
worth knowing the actual behavior of before relying on them:
- `spellcasting` on a species/feat/item only ever supplies a DC/attack-bonus ability —
  it never grants its own slot progression. It exists so a `grantSpell` effect (e.g. a
  racial innate spell) has *something* to compute a DC against when there's no
  class-based caster on the sheet at all.
- `grantSpell` has an optional `minLevel` (defaults to 1) for spells a species/feat
  grants only once the character reaches a given total level (e.g. a Tiefling's Hellish
  Rebuke at 3rd, Darkness at 5th) — it is **not** gated by class level or spell slots.
- Effects are collected from species, feats, active (and attuned) items, *and* every
  currently-active class/subclass/background feature — not just species/feat/item like
  the first pass of this system did. If you add an effect to a class feature and it
  doesn't seem to apply, that plumbing is already there; check the effect itself first.
- `sense` still has a narrow legacy heuristic alongside the real effect: darkvision is
  additionally inferred from a trait id containing `"darkvision"` even with no `sense`
  effect present, for content that predates this system. New content should use a real
  `sense` effect instead of relying on the id-substring match.

## Edition separation

A character is either 5e (`'2014'`, PHB2014 + Tasha's) or 5.5e (`'2024'`, PHB2024) — no
mixing content between them for a single character. `crossEditionRef` on a *custom*
content entry is a pointer offered when a user-authored entry's normalized name matches
one in the other edition; it aliases, it doesn't merge.

Edition-specific *data* (spell slot tables, starting equipment, subclass unlock levels)
lives in the per-edition JSON files (`data/2014/`, `data/2024/`) — most editions deltas
are just different data feeding the same engine code, not different code paths.
Edition-specific *mechanics* that genuinely differ in rules (exhaustion's effect table,
2024 weapon mastery) live in `src/engine/editions/{2014,2024}.ts`.

## Typechecking — always use the project config

`npx tsc --noEmit` with no `-p` flag checks the **root** `tsconfig.json`, which is a
solution-style file (`"files": []`, just `references` to `tsconfig.app.json` /
`tsconfig.node.json`). Run that way, it type-checks *nothing* and reports success
unconditionally — it is not a weaker check, it is a no-op that looks like a pass. Always
run **`pnpm typecheck`** (equivalently `tsc --noEmit -p tsconfig.app.json`) to actually
check the app. This bit us for real: a whole session's worth of `npx tsc --noEmit` calls
silently passed while `abilityImprovements`/personality-field test fixtures and a real
`characterFactory.ts` bug had been broken the entire time — only caught once something
else forced a `-p tsconfig.app.json` run.

## Schema conventions

- `src/schema/` is the single source of truth. Every content kind, the character
  build/state split, effects, and export files are Zod schemas; `z.infer<>` is the only
  place TS types for this data should come from.
- **Decisions, not results.** `Character.build` records what the player chose (species
  ref, class levels, decision answers, known spells); `Character.state` records
  play-time mutable state (HP, conditions, inventory, currency). The derived sheet
  (`DerivedSheet`) is *never* persisted — `computeSheet(character, contentIndex)` is
  pure and cheap enough to recompute on every render. This is what makes engine bug
  fixes retroactive and schema migrations rare: fix `compute.ts`, every existing
  character's sheet is correct next render, no data migration needed.
- `ContentEntry.origin` is `'seed' | 'extracted' | 'custom'`. Seed content ships as
  static JSON per edition and is never written to IndexedDB. Only `custom` and
  `extracted` (Tasha's/2024-PHB, gitignored, baked in via `src/content/loader.ts`)
  content lives in Dexie.
- Every content id is a stable string (`"2014/spell/fireball"` for seed, a UUID for
  custom). Never reuse an id across two conceptually different entries — a real bug hit
  during Tasha's curation was two distinct features (Fighter's Psi Warrior and Rogue's
  Soulknife, both named "Psionic Power") getting minted the *same* id by the extraction
  pipeline, which silently clobbers one wherever entries are merged into a `Map` by id
  (the content loader, the search index, `computeSheet`'s index). If you're
  hand-authoring or scripting content, verify id uniqueness before writing.

## Content curation (Tasha's / 2024 PHB extraction)

`scripts/extract/curate.py` hand-places LLM-extracted content into the right structural
slot (new class, new subclass with `featuresByLevel`, new species) — the extraction
pipeline can pull rules text reliably but can't reliably infer *where in the data model*
something belongs. When curating:
- A feature referenced by a subclass's `featuresByLevel` (or a class's `featureRefs`)
  must still be emitted as its own `kind: 'feature'` entry in the output — referencing an
  id that doesn't exist anywhere is a silent dangling reference; `computeSheet`'s
  `addFeature()` no-ops on a missing lookup instead of erroring, so this fails quietly.
- Flag best-effort/uncertain data (unlock levels guessed from partial extraction,
  approximated tables) explicitly in the script's output summary rather than presenting
  a guess as authoritative.

## Testing

- `src/engine/compute.test.ts` — golden-character fixtures: hand-computed expected stats
  for known builds (not just level 1; includes multiclass slot-pooling cases). Any
  change to `compute.ts` should keep these passing without editing the fixtures'
  expected values — if a fixture's expected value needs to change, that's a signal the
  "fix" might be a regression, not an improvement.
- `pnpm validate:data` — Zod-parses every seed/extraction JSON file end to end (content
  schema + referential id checks). Run after any hand-edit to `data/**/*.json` or
  `scripts/seed`/`scripts/extract` output.
- Prefer verifying a UI change by actually driving it in a browser (Playwright) over
  trusting `tsc`/unit tests alone for anything a player would click through — several
  real bugs in this project (dangling feature refs, id collisions, missing spell lists)
  were only caught by looking at a rendered character sheet, not by type-checking or
  schema validation.
