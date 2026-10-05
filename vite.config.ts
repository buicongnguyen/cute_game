import { defineConfig, type Plugin } from 'vite';
import { modelVersions } from './server/model-versions.mjs';

const configuredBase = process.env.VITE_BASE_PATH || '/';
const base = configuredBase.endsWith('/') ? configuredBase : `${configuredBase}/`;

function buildInfo(): Plugin {
  let info = { base: '/', edition: 'online' };
  return {
    name: 'zoo-build-info',
    configResolved(config) { info = { base: config.base, edition: config.env.VITE_STATIC_HOST === 'true' ? 'solo' : 'online' }; },
    generateBundle() { this.emitFile({ type: 'asset', fileName: 'build-info.json', source: JSON.stringify(info) }); },
  };
}

export default defineConfig(({ command }) => ({
  base,
  plugins: [buildInfo()],
  // Builds tag each model URL with its content hash (src/assets.ts modelUrl); the dev server serves
  // public/ live, so it keeps plain URLs that follow model edits without a restart.
  define: { __ZOO_MODEL_VERSIONS__: JSON.stringify(command === 'build' ? modelVersions('public/assets/models') : {}) },
  server: { proxy: { '/api': 'http://127.0.0.1:8787', '/socket': { target: 'ws://127.0.0.1:8787', ws: true } } },
  preview: { proxy: { '/api': 'http://127.0.0.1:8787', '/socket': { target: 'ws://127.0.0.1:8787', ws: true } } },
  build: { rollupOptions: { output: { manualChunks: { three: ['three'] } } } },
}));
