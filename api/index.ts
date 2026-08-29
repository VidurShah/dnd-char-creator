/**
 * Vercel serverless entry point.
 *
 * Plain "index.ts" rather than a [...path].ts catch-all, deliberately: the
 * bracket form is a framework routing convention this project doesn't use, and
 * brackets are glob character classes, so "api/[...path].ts" in vercel.json's
 * `functions` map doesn't even match the file it names. vercel.json instead
 * rewrites /api/* here explicitly.
 *
 * An Express app is itself a (req, res) => void handler, so exporting it
 * directly is all Vercel's Node runtime needs.
 *
 * The .js extension on the import is required, not cosmetic: Vercel transpiles
 * each TS file to ESM without bundling, so an extensionless specifier survives
 * into the output and Node's ESM loader rejects it at runtime.
 */
import { createApp } from '../server/app.js';

export default createApp();
