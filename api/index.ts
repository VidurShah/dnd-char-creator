/**
 * Vercel serverless entry point. An Express app is itself a
 * (req, res) => void handler, so exporting it directly is all Vercel's Node
 * runtime needs. vercel.json rewrites every /api/* path here, and the app
 * routes on the original URL from there.
 */
import { createApp } from '../server/app';

export default createApp();
