import { defineConfig, type Plugin } from 'vite';
import type { PreRenderedChunk } from 'rollup';
import { assetVersions, modelVersions } from './server/model-versions.mjs';

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

/**
 * Chunks are named after what they hold (FIX-PLAN 2.4): Rollup names a shared chunk after one of its modules, so the
 * world, the model loader and the farm pen shipped as "colossus-sleep". The first rule that matches a module of a chunk
 * names it; the entry and the other lazy chunks (modes, insight, vi-pack) keep their own names.
 */
const CHUNK_NAMES: Array<[string, RegExp]> = [
  ['world', /\/src\/world\.ts$/], // the 3D world, its views and the model loader (assets.ts, GLTFLoader, meshopt decoder)
  ['rules', /\/src\/combat\.ts$/], // game rules and content used at start and by the modes and the Almanac (never by vi-pack: see 'tables' below)
];
function chunkName(chunk: PreRenderedChunk) {
  if (chunk.isEntry) return chunk.name;
  const ids = chunk.moduleIds.map(id => id.replace(/\\/g, '/'));
  return CHUNK_NAMES.find(([, rule]) => ids.some(id => rule.test(id)))?.[0] ?? chunk.name;
}
/** Game modules the Vietnamese pack (src/locales) imports at run time, besides help-topics.ts. Checked by tests/build-await-cycle.test.mjs. */
const PACK_TABLES = ['boss-pet-content.ts', 'ctf-content.ts', 'dungeon-content.ts'];
/** Chunks pinned by hand: three.js on its own (it changes least), and the guide's text, fetched when it first opens. */
function manualChunk(id: string) {
  const path = id.replace(/\\/g, '/');
  if (path.includes('/node_modules/three/build/')) return 'three';
  if (path.endsWith('/src/help-topics.ts')) return 'help';
  // The content tables the Vietnamese pack reads its English names from. i18n.ts awaits the pack at start (top-level await), so the
  // pack must never import the chunk that holds i18n.ts, or the two wait on each other and the page stays blank. These tables
  // import nothing at run time; tests/build-await-cycle.test.mjs fails the build check if a locale file reaches further.
  if (PACK_TABLES.some(file => path.endsWith(`/src/${file}`))) return 'tables';
  return undefined;
}

export default defineConfig(({ command }) => ({
  base,
  plugins: [buildInfo()],
  // Builds tag each model URL with its content hash (src/assets.ts modelUrl); the dev server serves
  // public/ live, so it keeps plain URLs that follow model edits without a restart.
  define: { __ZOO_MODEL_VERSIONS__: JSON.stringify(command === 'build' ? modelVersions('public/assets/models') : {}), __ZOO_ASSET_VERSIONS__: JSON.stringify(command === 'build' ? assetVersions('public/assets') : {}) },
  server: { proxy: { '/api': 'http://127.0.0.1:8787', '/socket': { target: 'ws://127.0.0.1:8787', ws: true } } },
  preview: { proxy: { '/api': 'http://127.0.0.1:8787', '/socket': { target: 'ws://127.0.0.1:8787', ws: true } } },
  build: { rollupOptions: { output: {
    manualChunks: manualChunk,
    // Small shared chunks (the content tables ctf-content and dungeon-content, skill-info...) join a chunk that is loaded
    // wherever they are: the start-up code imports them anyway, so each was one more request preloaded at start (2.3).
    experimentalMinChunkSize: 24_000,
    chunkFileNames: chunk => `assets/${chunkName(chunk)}-[hash].js`,
  } } },
}));
