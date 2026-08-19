/**
 * Vercel serverless entry point.
 *
 * The [...path] catch-all filename is what makes every /api/* subpath route
 * here natively, without a vercel.json rewrite — and it means Vercel preserves
 * the original request URL, so Express routes on the real path (/api/ai/generate)
 * rather than a rewritten one.
 *
 * An Express app is itself a (req, res) => void handler, so exporting it
 * directly is all Vercel's Node runtime needs.
 */
import { createApp } from '../server/app';

export default createApp();
