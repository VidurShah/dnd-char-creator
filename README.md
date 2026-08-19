# Grimoire

A local-first D&D character creator and play companion, covering both 5e (2014,
PHB + Tasha's) and 5.5e (2024, PHB2024). Build a character, level it up, and run
it at the table — with an AI advisor that knows your actual sheet.

Characters live in your browser (IndexedDB), so the app works offline and
nothing leaves your machine unless you ask it to.

## Quick start

```sh
pnpm install
cp .env.example .env      # then paste a Gemini API key for the AI features
pnpm dev
```

That serves the app on <http://localhost:5173> and the API on
<http://localhost:3000>. Vite proxies `/api` to the API server, so the browser
only ever sees one origin — the same shape as production.

The AI features need a `GEMINI_API_KEY`; everything else works without one.

## Architecture

```
browser                     server/ (Express)
┌──────────────────┐        ┌────────────────────┐
│ React SPA        │        │ POST /api/ai/      │
│ Dexie/IndexedDB  │─/api/─►│      generate      │──► Gemini
│ computeSheet()   │        │ GET  /api/health   │
└──────────────────┘        └────────────────────┘
```

- **`src/schema/`** — Zod schemas are the single source of truth for every
  content kind and for the character build/state split. TS types come from
  `z.infer<>` and nowhere else.
- **`src/engine/`** — `computeSheet(character, contentIndex)` is pure and
  derives the whole sheet on every render. Derived state is never persisted,
  which is what makes engine fixes retroactive across existing characters.
- **`src/db/`** — Dexie. Characters, custom content, imported packs, settings.
- **`server/`** — the API. One Express app with two entry points that share an
  implementation: `server/dev.ts` for local, `api/[...path].ts` for Vercel's
  Node runtime. It exists chiefly to hold `GEMINI_API_KEY` server-side — the
  key is never in client code, the bundle, or a network payload.

See [CLAUDE.md](CLAUDE.md) for the engine and content conventions, which are
worth reading before touching `src/engine/` or `src/schema/`.

## Scripts

| command | what it does |
| --- | --- |
| `pnpm dev` | Vite + API server together |
| `pnpm build` | typecheck all projects, then build the SPA to `dist/` |
| `pnpm preview` | serve the production build, with the API |
| `pnpm typecheck` | **use this, not `npx tsc --noEmit`** — see below |
| `pnpm test` | Vitest |
| `pnpm lint` | oxlint |
| `pnpm validate:data` | Zod-parse every seed/extraction JSON, end to end |

⚠️ `npx tsc --noEmit` with no `-p` flag checks the root `tsconfig.json`, which
is a solution-style file with `"files": []`. Run that way it type-checks
*nothing* and reports success unconditionally. Always use `pnpm typecheck`.

## Environment

All server-side, none `VITE_`-prefixed — a `VITE_` prefix would inline the
value into the client bundle. See [.env.example](.env.example).

| var | purpose |
| --- | --- |
| `GEMINI_API_KEY` | shared fallback key for `/api/ai/generate` |
| `PORT` | local API port (default 3000) |

Players can paste their own Gemini key in Settings; it's stored locally and
used instead of the server's, and it skips the shared-key rate limit.

## Deployment

Vercel (SPA from `dist/`, API as a Node function) — [`vercel.json`](vercel.json)
has the whole configuration. Set `GEMINI_API_KEY` in the Vercel project's
environment variables.

## Feedback

Found a bug or have an idea? Open an issue on
[the tracker](https://github.com/VidurShah/dnd-char-creator/issues).

## Legal

Grimoire is an independent project, not affiliated with or endorsed by Wizards
of the Coast.

The repository currently has **no LICENSE file**, and `data/2024/` holds rules
content produced by the extraction pipeline in `scripts/extract/`. Worth
settling what's actually redistributable here — SRD 5.1 and SRD 5.2 are under
Creative Commons, but non-SRD material from a published rulebook is not —
before pointing anyone at the deployment.
