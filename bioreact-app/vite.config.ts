import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';
import { fileURLToPath } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));

/**
 * Two builds come out of this config.
 *
 *   npm run dev     the interface against the local Python service
 *   npm run build   a static bundle of the same interface
 *
 * The static build uses relative asset paths, so it works whether it is
 * served from the root of a domain or from a project path on GitHub
 * Pages, and it carries the recorded run in public/demo/ — which is what
 * the interface falls back to when no service answers.
 */
export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': path.resolve(here, '.') },
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: false,
    chunkSizeWarningLimit: 1200,
  },
});
