# Grimoire

A local-first D&D character creator and play companion, covering both 5e (2014,
PHB + Tasha's) and 5.5e (2024, PHB2024). Build a character, level it up, and run
it at the table — with an AI advisor that knows your actual sheet.

Characters live in your browser (IndexedDB), so the app works offline and
nothing leaves your machine unless you ask it to. It installs to a phone home
screen and runs with no network: the sheet, dice, HP and conditions tracking,
and the whole content Library are all available at a table with no signal.
Only cloud sync and the AI need a connection, and the header says so when
there isn't one.

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
  implementation: `server/dev.ts` for local, `api/index.ts` for Vercel's Node
  runtime. Holds `GEMINI_API_KEY` server-side, verifies Clerk sessions, and
  serves sync and feedback.
- **`src/sync/`** — cloud sync. An outbox queues local writes; a server-assigned
  `rev` counter orders pulls. Conflicts are last-write-wins on each document's
  `updatedAt` (see issue #1).

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
| `pnpm check:ui` | drive the app in a real browser; fails on horizontal overflow at phone widths, or if the header vanishes while a route loads (needs `pnpm dev` running) |
| `pnpm db:generate` | regenerate SQL migrations from the Drizzle schema |
| `pnpm db:migrate` | apply `drizzle/*.sql` to `DATABASE_URL` |

⚠️ `npx tsc --noEmit` with no `-p` flag checks the root `tsconfig.json`, which
is a solution-style file with `"files": []`. Run that way it type-checks
*nothing* and reports success unconditionally. Always use `pnpm typecheck`.

## Environment

All server-side, none `VITE_`-prefixed — a `VITE_` prefix would inline the
value into the client bundle. See [.env.example](.env.example).

| var | purpose |
| --- | --- |
| `GEMINI_API_KEY` | shared fallback key for `/api/ai/generate` |
| `CLERK_SECRET_KEY` | server-side Clerk key; enables accounts |
| `VITE_CLERK_PUBLISHABLE_KEY` | client Clerk key — public by design, hence the `VITE_` prefix |
| `DATABASE_URL` | Neon Postgres; enables sync and feedback |
| `GITHUB_TOKEN` | fine-grained PAT so feedback opens issues |
| `PORT` | local API port (default 3000) |

Every one of these is optional except `GEMINI_API_KEY`, and each missing key
disables exactly one feature rather than breaking the app. The server also
accepts `CLERK_PUBLISHABLE_KEY` or `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` in place
of the `VITE_` one — the Vercel Marketplace integration provisions the
`NEXT_PUBLIC_` name.

Accounts are optional. With the Clerk keys unset, Grimoire runs as a
local-only build: no account UI, every request anonymous, and the shared Gemini
key usable without signing in. That's the supported path for a fresh clone.

Players can paste their own Gemini key in Settings; it's stored locally and
used instead of the server's, and it skips the shared-key rate limit.

## Deployment

Vercel (SPA from `dist/`, API as a Node function) — [`vercel.json`](vercel.json)
has the whole configuration. Set `GEMINI_API_KEY` in the Vercel project's
environment variables.

## Accounts and sync

Signing in is optional. Without an account, characters live in this browser
and nothing leaves your machine. Signing in backs the vault up and syncs it
across devices, and lets you use the built-in AI without supplying your own
Gemini key.

## Feedback

Use the Feedback button in the app — it opens an issue on
[the tracker](https://github.com/VidurShah/dnd-char-creator/issues) for you.

## Legal

Grimoire is an independent project, not affiliated with or endorsed by Wizards
of the Coast.

The repository currently has **no LICENSE file**, and `data/2024/` holds rules
content produced by the extraction pipeline in `scripts/extract/`. Worth
settling what's actually redistributable here — SRD 5.1 and SRD 5.2 are under
Creative Commons, but non-SRD material from a published rulebook is not —
before pointing anyone at the deployment.
