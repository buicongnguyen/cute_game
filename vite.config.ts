import { defineConfig } from 'vite';

const configuredBase = process.env.VITE_BASE_PATH || '/';
const base = configuredBase.endsWith('/') ? configuredBase : `${configuredBase}/`;

export default defineConfig({
  base,
  server: { proxy: { '/api': 'http://127.0.0.1:8787', '/socket': { target: 'ws://127.0.0.1:8787', ws: true } } },
  preview: { proxy: { '/api': 'http://127.0.0.1:8787', '/socket': { target: 'ws://127.0.0.1:8787', ws: true } } },
  build: { rollupOptions: { output: { manualChunks: { three: ['three'] } } } },
});
