// Same model already confirmed working for the PDF extraction pipeline (see
// scripts/extract/geminiClient.ts) — gemini-2.5-pro had zero free-tier quota and
// gemini-2.5-flash 404'd as no-longer-available-to-new-users when this was checked
// against the live /v1beta/models list, so don't add either back without re-checking.
export const AI_MODELS = [{ id: 'gemini-3.5-flash', label: 'Gemini 3.5 Flash' }] as const;

export const DEFAULT_AI_MODEL = 'gemini-3.5-flash';
