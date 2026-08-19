/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';

/**
 * The API lives in a separate Express process (server/, started alongside Vite
 * by `pnpm dev`) rather than in Vite middleware, so that the exact same code
 * runs in production as a Vercel function. Proxying /api here keeps the
 * browser on a single origin in dev, matching prod — no CORS, no env-specific
 * base URL in the client.
 */
const API_ORIGIN = process.env.API_ORIGIN ?? 'http://localhost:3000';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@data': path.resolve(__dirname, './data'),
    },
  },
  server: {
    proxy: { '/api': API_ORIGIN },
  },
  preview: {
    proxy: { '/api': API_ORIGIN },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./tests/setup.ts'],
  },
});
