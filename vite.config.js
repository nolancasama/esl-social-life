import { defineConfig } from 'vite';

// Relative base so the built game works from any static host or sub-folder
// (school server, GitHub Pages, a shared drive served over http).
export default defineConfig({
  base: './',
  build: { chunkSizeWarningLimit: 1200 },
  server: { host: true },
});
