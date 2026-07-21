/// <reference types="vitest/config" />
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';
import { geminiProxyPlugin } from './vite-plugins/geminiProxy.js';

export default defineConfig(({ mode }) => {
  // '' prefix = load every var in .env, not just VITE_-prefixed ones — this is
  // how GEMINI_API_KEY reaches the proxy plugin without ever being exposed to
  // client code via import.meta.env (which only sees VITE_-prefixed vars).
  const env = loadEnv(mode, process.cwd(), '');

  return {
    plugins: [react(), tailwindcss(), geminiProxyPlugin(env)],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
        '@data': path.resolve(__dirname, './data'),
      },
    },
    test: {
      environment: 'jsdom',
      globals: true,
      setupFiles: ['./tests/setup.ts'],
    },
  };
});
