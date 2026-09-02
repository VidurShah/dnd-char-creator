/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
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
  plugins: [react(), tailwindcss(), pwa()],
  build: {
    rollupOptions: {
      output: {
        /**
         * Seed-content chunks go to assets/data/ so the service worker can tell
         * them apart from app code by path alone. They are runtime-cached on
         * demand rather than precached: precaching them would pull ~1.9 MB of
         * both editions' spells and items back onto first load, undoing the
         * split in src/content/loader.ts. Opening a character caches that
         * edition, which is what makes it available offline afterwards.
         */
        chunkFileNames(chunk) {
          const fromData = chunk.moduleIds?.some((id) => id.replace(/\\/g, '/').includes('/data/'));
          return fromData ? 'assets/data/[name]-[hash].js' : 'assets/[name]-[hash].js';
        },
      },
    },
  },
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

/**
 * Offline support.
 *
 * Grimoire is local-first in every other respect — Dexie holds the characters,
 * computeSheet() is pure and client-side — but the app shell still had to come
 * off the network to boot, so a play companion meant for a table in a basement
 * or a game store simply did not open without signal. This closes that gap and
 * makes the app installable to a phone home screen, which is how it actually
 * gets used at a table.
 */
function pwa() {
  return VitePWA({
    registerType: 'autoUpdate',
    includeAssets: ['favicon.svg', 'icons.svg', 'apple-touch-icon.png'],
    manifest: {
      name: 'Grimoire',
      short_name: 'Grimoire',
      description: 'A local-first D&D 5e and 5.5e character creator and play companion.',
      theme_color: '#e9dcc0',
      background_color: '#e9dcc0',
      display: 'standalone',
      start_url: '/characters',
      icons: [
        { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
        { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
        // Separate art: a maskable icon is cropped to a platform-chosen shape,
        // so its content sits inside the safe circle rather than filling the square.
        { src: 'pwa-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      ],
    },
    workbox: {
      // The shell only. Seed content lands in assets/data/ (see chunkFileNames)
      // and is runtime-cached instead, so first load stays small.
      globPatterns: ['**/*.{css,html,svg,png,ico,woff2}', 'assets/*.js'],
      navigateFallback: 'index.html',
      // Sync and AI must never be served stale, and must fail rather than lie
      // when offline -- the sync engine already surfaces that as an error state.
      navigateFallbackDenylist: [/^\/api\//],
      runtimeCaching: [
        {
          // Seed content: immutable for the life of a build and content-hashed,
          // so cache-first is safe and a new build simply misses and refetches.
          urlPattern: ({ url }) => url.pathname.startsWith('/assets/data/'),
          handler: 'CacheFirst',
          options: {
            cacheName: 'grimoire-seed-content',
            expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 90 },
            cacheableResponse: { statuses: [0, 200] },
          },
        },
        {
          urlPattern: ({ url }) => url.pathname.startsWith('/api/'),
          handler: 'NetworkOnly',
        },
      ],
    },
  });
}
