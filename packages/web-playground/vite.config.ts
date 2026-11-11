import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// The engine is compiled from source, so `npm run dev` and `npm run build:web` need no
// prior engine build, and edits to the engine hot-reload in the browser.
const engineEntry = fileURLToPath(new URL('../core-engine/src/index.ts', import.meta.url));

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@phantomguard/core-engine': engineEntry },
  },
  build: {
    target: 'es2022',
    sourcemap: false,
    // Requirement 20.3 budgets 250 KiB gzipped for first load; warn well before that.
    chunkSizeWarningLimit: 400,
  },
});
