import { z } from 'zod';

/**
 * Wire format for /api/ai/generate. Shared by the browser client and the API
 * route so the contract can't drift between them.
 *
 * Imports nothing but zod, deliberately — server/ compiles under nodenext with
 * `verbatimModuleSyntax`, where a relative import needs an explicit .js
 * specifier. Keeping this file dependency-free is what lets the server import
 * it at all, the same reason schema/sync.ts and schema/feedback.ts do it.
 */

/**
 * Models the shared server key may be spent on.
 *
 * The source of truth for the allowlist, because the *server* is the only place
 * enforcing it matters: the endpoint is reachable with curl, so a client-side
 * list is a suggestion. src/ai/models.ts builds its labelled UI list from this
 * and carries the notes on why this particular model was chosen.
 */
export const AI_MODEL_IDS = ['gemini-3.1-flash-lite'] as const;
export type AiModelId = (typeof AI_MODEL_IDS)[number];

/**
 * Ceiling on the serialized prompt of one shared-key request — `contents` and
 * `config` together, since Gemini's config carries systemInstruction and tools
 * and a payload parked there costs exactly as much upstream as one in contents.
 *
 * Sized well above real usage — the AI builder's system prompt is the content
 * catalog plus a character sheet, tens of KB — and well below express's 2mb
 * body limit, which is generous for a different reason and is not a spend
 * control. This is the spend control: it stops the endpoint being used as a
 * bulk relay for content that has nothing to do with building a character.
 */
export const MAX_SHARED_KEY_REQUEST_BYTES = 512 * 1024;

/**
 * Bytes one shared-key request will cost upstream.
 *
 * Counts `contents` and `config` together, and the together is the whole point:
 * an earlier version measured `contents` alone, but the advisor puts its entire
 * system prompt in `config.systemInstruction` and the builder puts its tool
 * schema in `config.tools`. A 4 KB `contents` alongside a 900 KB
 * `systemInstruction` sailed through a contents-only check and reached Google
 * in full — the exact bulk-relay case the ceiling exists to stop.
 *
 * TextEncoder rather than Buffer so this stays importable from the browser;
 * src/ai/models.ts pulls the allowlist out of this same module.
 */
export function sharedKeyRequestBytes(body: { contents?: unknown; config?: unknown }): number {
  const serialized = JSON.stringify({ contents: body.contents ?? null, config: body.config ?? null });
  return new TextEncoder().encode(serialized).length;
}

export const GenerateRequestSchema = z.object({
  /** The player's own pasted Gemini key. Present means "bill this to me". */
  apiKey: z.string().min(1).optional(),
  model: z.string().min(1),
  contents: z.unknown(),
  config: z.unknown().optional(),
});
export type GenerateRequest = z.infer<typeof GenerateRequestSchema>;
