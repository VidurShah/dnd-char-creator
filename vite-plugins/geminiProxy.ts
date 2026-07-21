import type { Connect, Plugin } from 'vite';
import type { IncomingMessage } from 'node:http';

const PROXY_PATH = '/__api/gemini-generate';

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => (data += chunk));
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

function makeHandler(env: Record<string, string>): Connect.NextHandleFunction {
  return async (req, res, next) => {
    if (req.url !== PROXY_PATH || req.method !== 'POST') {
      next();
      return;
    }
    try {
      const body = JSON.parse(await readBody(req)) as { apiKey?: string; model: string; contents: unknown; config: unknown };
      const apiKey = body.apiKey || env.GEMINI_API_KEY;
      if (!apiKey) {
        res.statusCode = 400;
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({ error: 'No Gemini API key configured — set GEMINI_API_KEY in .env, or paste one in Settings.' }));
        return;
      }
      // Explicit /node subpath — a bare "@google/genai" import can resolve to the
      // package's browser build even inside Vite plugin code (which runs in Node
      // but is loaded through Vite's own config/plugin resolution), and that build
      // doesn't handle simple API-key auth the same way, causing spurious
      // "expected OAuth2 access token" errors despite a valid key.
      const { GoogleGenAI } = await import('@google/genai/node');
      const ai = new GoogleGenAI({ apiKey, vertexai: false });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const response = await ai.models.generateContent({ model: body.model, contents: body.contents as any, config: body.config as any });
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ functionCalls: response.functionCalls ?? [] }));
    } catch (err) {
      res.statusCode = 500;
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ error: err instanceof Error ? err.message : 'Gemini proxy failed.' }));
    }
  };
}

/**
 * Keeps the Gemini API key entirely server-side: the browser only ever talks
 * to this local /__api/gemini-generate endpoint (same origin, no CORS, no key
 * in the client bundle or network payload for the default no-Settings-override
 * path) — GEMINI_API_KEY is read from .env via Vite's own loadEnv() with no
 * "VITE_" prefix, so it never becomes part of import.meta.env / the client
 * bundle at all. Only works when actually running through the Vite dev or
 * preview server (i.e. `pnpm dev` / `pnpm build && pnpm preview`), not a bare
 * static file open — that's already how this app is always run.
 */
export function geminiProxyPlugin(env: Record<string, string>): Plugin {
  const handler = makeHandler(env);
  return {
    name: 'gemini-proxy',
    configureServer(server) {
      server.middlewares.use(handler);
    },
    configurePreviewServer(server) {
      server.middlewares.use(handler);
    },
  };
}
