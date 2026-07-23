/**
 * Talks to the local /__api/gemini-generate endpoint (see
 * vite-plugins/geminiProxy.ts) instead of calling Gemini directly from the
 * browser — the API key never leaves the Vite dev/preview server process, so
 * it's never present in client code, the built bundle, or a network request
 * unless the player has explicitly pasted their own override key in Settings.
 */

const PROXY_PATH = '/__api/gemini-generate';

export interface ToolDef {
  name: string;
  description: string;
  inputSchema: unknown;
}

export type ValidationResult<T> = { success: true; data: T } | { success: false; error: string };

interface FunctionCall {
  name: string;
  args: unknown;
}

/**
 * How long to wait on a single generate call before giving up. The models this
 * app has quota for are preview/thinking models that intermittently stall or
 * return 503 under load — without a ceiling the browser "Generate" button would
 * spin forever on a hung request instead of surfacing a retryable error.
 */
const REQUEST_TIMEOUT_MS = 60_000;

/** True for transient server-side errors (overloaded model) that are worth one retry. */
function isRetryable(message: string): boolean {
  return /\b(503|429|500|unavailable|overloaded|high demand|try again)\b/i.test(message);
}

async function callProxyOnce(apiKeyOverride: string | undefined, model: string, contents: unknown, config: unknown): Promise<FunctionCall[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(PROXY_PATH, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ apiKey: apiKeyOverride || undefined, model, contents, config }),
      signal: controller.signal,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new Error(`The AI service didn't respond within ${REQUEST_TIMEOUT_MS / 1000}s — it's likely overloaded. Try again in a moment.`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? `Gemini proxy error ${res.status}`);
  return body.functionCalls ?? [];
}

/** Wraps a single generate call with one automatic retry on a transient overload error. */
async function callProxy(apiKeyOverride: string | undefined, model: string, contents: unknown, config: unknown): Promise<FunctionCall[]> {
  try {
    return await callProxyOnce(apiKeyOverride, model, contents, config);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (!isRetryable(message)) throw err;
    return callProxyOnce(apiKeyOverride, model, contents, config);
  }
}

/**
 * Forces a specific function call and validates its output. On a validation
 * failure, sends the error back as a functionResponse and retries once
 * before giving up — the caller is expected to flag whatever's left
 * unresolved as "needs your choice" rather than silently guessing.
 *
 * `apiKeyOverride` is optional — when omitted, the proxy falls back to
 * GEMINI_API_KEY from .env server-side.
 */
export async function callToolWithValidation<T>(
  apiKeyOverride: string | undefined,
  model: string,
  userMessage: string,
  tool: ToolDef,
  validate: (input: unknown) => ValidationResult<T>,
): Promise<{ data: T } | { error: string }> {
  const contents: Array<{ role: string; parts: Record<string, unknown>[] }> = [{ role: 'user', parts: [{ text: userMessage }] }];
  const config = {
    tools: [{ functionDeclarations: [{ name: tool.name, description: tool.description, parametersJsonSchema: tool.inputSchema }] }],
    toolConfig: { functionCallingConfig: { mode: 'ANY', allowedFunctionNames: [tool.name] } },
  };

  for (let attempt = 0; attempt < 2; attempt++) {
    let functionCalls: FunctionCall[];
    try {
      functionCalls = await callProxy(apiKeyOverride, model, contents, config);
    } catch (err) {
      return { error: err instanceof Error ? err.message : 'Gemini proxy request failed.' };
    }

    const call = functionCalls.find((c) => c.name === tool.name);
    if (!call) return { error: 'The model did not return the expected function call.' };

    const result = validate(call.args);
    if (result.success) return { data: result.data };

    if (attempt === 0) {
      contents.push({ role: 'model', parts: [{ functionCall: { name: call.name, args: call.args } }] });
      contents.push({ role: 'user', parts: [{ functionResponse: { name: call.name, response: { error: `Validation failed: ${result.error}. Please call the function again with corrected values.` } } }] });
    } else {
      return { error: result.error };
    }
  }
  return { error: 'The model did not return a valid response after a retry.' };
}
