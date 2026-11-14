import { defineConfig } from 'vite';

export default defineConfig({
  // Relative base so the build works from any static host path (e.g. GitHub Pages).
  base: './',
  // three.js alone is ~600 kB minified; that's expected for a single-page 3D viewer.
  build: { chunkSizeWarningLimit: 800 },
});
