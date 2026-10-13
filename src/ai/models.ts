// Model availability is gated by the configured API key's tier, not just the
// live /v1beta/models list. Checked 2026-07 against the key in .env:
//   - gemini-2.0/2.5-flash and *-latest: quota "limit: 0" (free tier disabled) / 404.
//   - gemini-3.5-flash: callable but a heavy *thinking* model that stalls or 503s
//     under load (hundreds of thought tokens even for a trivial call) — do not use.
//   - gemini-3.1-flash-lite: fast, non-thinking, and returned a valid tool call
//     3/3 at ~0.65s each. This is the reliable choice for this key.
// geminiClient.ts still enforces a request timeout + one transient-error retry as a
// safety net. Re-verify a model with a real function-calling call before switching:
//   curl ".../models/<id>:generateContent?key=$GEMINI_API_KEY" -d '{"contents":[...],"tools":[...]}'
// The id list itself lives in src/schema/aiProxy.ts, which the server imports to
// enforce the allowlist — a client-side list alone is only a suggestion, since
// /api/ai/generate is reachable directly.
import { AI_MODEL_IDS, type AiModelId } from '@/schema/aiProxy';

const LABELS: Record<AiModelId, string> = {
  'gemini-3.1-flash-lite': 'Gemini 3.1 Flash Lite',
};

export const AI_MODELS = AI_MODEL_IDS.map((id) => ({ id, label: LABELS[id] }));

// Annotated `string`, not AiModelId: callers hold it in useState and assign a
// saved id back, so a literal type here would narrow that state to one value.
// Derived from the allowlist so the default is always a member of it.
export const DEFAULT_AI_MODEL: string = AI_MODEL_IDS[0];
