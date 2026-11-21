import { mkdirSync, writeFileSync } from 'node:fs';
import nodePath from 'node:path';
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
  ['features', /\/src\/features\.ts$/], // the feature modules, loaded after Start (see manualChunk below)
];
export function chunkName(chunk: Pick<PreRenderedChunk, 'isEntry' | 'name' | 'moduleIds'>) {
  if (chunk.isEntry) return chunk.name;
  const ids = chunk.moduleIds.map(id => id.replace(/\\/g, '/'));
  return CHUNK_NAMES.find(([, rule]) => ids.some(id => rule.test(id)))?.[0] ?? chunk.name;
}
/** Game modules the Vietnamese pack (src/locales) imports at run time, besides help-topics.ts. Checked by tests/build-await-cycle.test.mjs. */
const PACK_TABLES = ['boss-pet-content.ts', 'ctf-content.ts', 'dungeon-content.ts'];
/** Chunks pinned by hand: three.js on its own (it changes least), and the guide's text, fetched when it first opens. */
export function manualChunk(id: string) {
  const path = id.replace(/\\/g, '/');
  // The features' Vietnamese phrases: plain tables that import nothing, fetched only in Vietnamese. Pinned, or the small
  // chunk would be folded into the start download (experimentalMinChunkSize below).
  if (path.includes('/src/features-vi/')) return 'features-vi';
  // src/features.ts, src/features/ and src/story/ are NOT pinned, on purpose: Rollup moves the static imports of a pinned
  // module into its chunk, so the first feature to import i18n.ts or sfx.ts would carry that module into "features" and
  // the start would have to import the lazy chunk. They form a chunk of their own anyway: only features.ts reaches them,
  // through the import() in main.ts, and its top-level `globalThis.zooFeatures = ...` line is a side effect, which keeps
  // Rollup from folding the chunk into another. `npm run perf:bytes` reads the chunk map (below) and fails if this stops being true.
  if (path.includes('/node_modules/three/build/')) return 'three';
  if (path.endsWith('/src/help-topics.ts')) return 'help';
  // The content tables the Vietnamese pack reads its English names from. i18n.ts awaits the pack at start (top-level await), so the
  // pack must never import the chunk that holds i18n.ts, or the two wait on each other and the page stays blank. These tables
  // import nothing at run time; tests/build-await-cycle.test.mjs fails the build check if a locale file reaches further.
  if (PACK_TABLES.some(file => path.endsWith(`/src/${file}`))) return 'tables';
  return undefined;
}

/**
 * Writes which source modules each built chunk holds and what each chunk imports, for `npm run perf:bytes` and
 * tests/lazy-split.test.mjs. The file stays outside dist/: server/build-offline.mjs lists every file in dist/, so a map
 * there would join the install list and the service worker's version hash.
 */
export function chunkMap(file = '.scratch/build/chunk-map.json'): Plugin {
  let root = '';
  return {
    name: 'zoo-chunk-map', apply: 'build',
    configResolved(config) { root = config.root; },
    generateBundle(_options, bundle) {
      const chunks: Record<string, { name: string; entry: boolean; imports: string[]; dynamicImports: string[]; modules: string[] }> = {};
      const local = (id: string) => id.startsWith('\0') ? id.slice(1) : nodePath.relative(root, id.split('?')[0]).replace(/\\/g, '/');
      for (const item of Object.values(bundle)) if (item.type === 'chunk') chunks[item.fileName] = { name: chunkName(item), entry: item.isEntry, imports: item.imports, dynamicImports: item.dynamicImports, modules: Object.keys(item.modules).map(local).sort() };
      const out = nodePath.resolve(root, file); mkdirSync(nodePath.dirname(out), { recursive: true }); writeFileSync(out, JSON.stringify({ chunks }, null, 1) + '\n');
    },
  };
}

export default defineConfig(({ command }) => ({
  base,
  plugins: [buildInfo(), chunkMap()],
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
