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
export const AI_MODELS = [{ id: 'gemini-3.1-flash-lite', label: 'Gemini 3.1 Flash Lite' }] as const;

export const DEFAULT_AI_MODEL = 'gemini-3.1-flash-lite';
