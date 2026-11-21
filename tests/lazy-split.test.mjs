import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { cpSync, existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'vite';
import { chunkMap, chunkName, manualChunk } from '../vite.config.ts';
import { LAZY_HOMES, lazySplitProblems } from '../promo/start-bytes.mjs';

// The first-visit weight depends on three structural promises. These tests keep them from eroding quietly.
const read = name => readFile(new URL(`../src/${name}`, import.meta.url), 'utf8');
const staticImports = source => [...source.matchAll(/^import\s+(?!type\b)[^;]*?from\s+['"]([^'"]+)['"]/gm)].map(m => m[1]);

test('main.ts reaches the optional modes only through modes.ts, loaded with import()', async () => {
  const main = await read('main.ts'), imports = staticImports(main);
  for (const lazy of ['dungeon', 'ctf', 'rescue', 'colossus', 'ranking', 'news-board', 'modes']) {
    assert.ok(!imports.some(file => file === `./${lazy}.ts`), `main.ts must not import ./${lazy}.ts statically`);
  }
  assert.match(main, /import\('\.\/modes\.ts'\)/);
  const modes = await read('modes.ts');
  for (const name of ['initDungeon', 'initCtf', 'initRescue', 'ColossusEvent', 'initRanking', 'initNewsBoard']) assert.match(modes, new RegExp(`export \\{ ${name} \\}`));
});

test('the lazy modes keep their sheets in the cascade: ranking and colossus CSS load from main.ts, not from the lazy modules', async () => {
  const main = await read('main.ts');
  assert.match(main, /import '\.\/ranking\.css'/);
  assert.match(main, /import '\.\/colossus\.css'/);
  assert.doesNotMatch(await read('ranking.ts'), /^import '\.\/ranking\.css'/m);
  assert.doesNotMatch(await read('colossus.ts'), /^import '\.\/colossus\.css'/m);
});

test('nothing outside modes.ts and the modes themselves imports a lazy mode module', async () => {
  const lazy = /^(dungeon|ctf|rescue|colossus|ranking|news-board)\.ts$/, owners = new Set(['modes.ts', 'main.ts']);
  const bad = [];
  for (const file of (await readdir(new URL('../src/', import.meta.url))).filter(f => f.endsWith('.ts') && !owners.has(f))) {
    for (const target of staticImports(await read(file))) {
      const name = target.replace(/^\.\//, '');
      if (lazy.test(name)) bad.push(`${file} -> ${target}`);
    }
  }
  assert.deepEqual(bad, [], 'a static import of a lazy mode module pulls its code back into the first download');
});

test('i18n.ts imports no Vietnamese catalog statically; vi-pack.ts is the one lazy entry', async () => {
  const i18n = await read('i18n.ts');
  assert.deepEqual(staticImports(i18n).filter(file => file.includes('locales/')), []);
  assert.match(i18n, /import\('\.\/locales\/vi-pack\.ts'\)/);
  const others = [];
  for (const file of (await readdir(new URL('../src/', import.meta.url))).filter(f => f.endsWith('.ts') && f !== 'i18n.ts')) {
    if (staticImports(await read(file)).some(target => /locales\/vi-pack/.test(target))) others.push(file);
  }
  assert.deepEqual(others, []);
});

test('Vietnamese phrases are in memory once the module is (Node keeps the old behaviour) and switchLanguage resolves', async () => {
  const { t, getLanguage, switchLanguage, setLanguage, loadVietnamese } = await import('../src/i18n.ts');
  await loadVietnamese();
  try {
    await switchLanguage('vi');
    assert.equal(getLanguage(), 'vi');
    assert.notEqual(t('Backpack'), 'Backpack');
  } finally { setLanguage('en'); }
  assert.equal(t('Backpack'), 'Backpack');
});

// ---- the feature chunks (docs/AAA-PLAN.md WP2) ----------------------------------------------------------------------
// The feature modules build into the "features" chunk and their Vietnamese phrases into "features-vi", and neither is part
// of the start download. `npm run perf:bytes` checks the real build with lazySplitProblems (promo/start-bytes.mjs); here the
// check runs on chunk maps written by hand, on a small project built with the game's own chunk rules and its own
// src/features.ts, and on the chunk map of the last build when there is one.
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const json = async file => (await import(pathToFileURL(file).href, { with: { type: 'json' } })).default;

test('the chunk rules: features.ts names its chunk, the phrase tables are pinned, feature code is left to its natural chunk', () => {
  assert.equal(manualChunk('C:\\game\\src\\features-vi\\moments.ts'), 'features-vi');
  assert.equal(manualChunk('/game/src/features-vi/moments.ts'), 'features-vi');
  // Not pinned: Rollup would carry the static imports of a pinned module (i18n.ts, sfx.ts) into the lazy chunk, and the start would import it.
  for (const id of ['/game/src/features.ts', '/game/src/features/moments.ts', '/game/src/story/scenes.ts', '/game/src/game-services.ts', '/game/src/main.ts']) assert.equal(manualChunk(id), undefined, id);
  assert.equal(manualChunk('/game/node_modules/three/build/three.module.js'), 'three');
  assert.equal(chunkName({ isEntry: false, name: 'features', moduleIds: ['/game/src/game-services.ts', 'C:\\game\\src\\features.ts'] }), 'features');
  assert.equal(chunkName({ isEntry: false, name: 'hud', moduleIds: ['/game/src/features/hud.ts'] }), 'hud', 'a feature module alone does not name a chunk');
  assert.equal(chunkName({ isEntry: true, name: 'index', moduleIds: ['/game/src/features.ts'] }), 'index', 'an entry keeps its name');
  assert.deepEqual(LAZY_HOMES.map(([name]) => name), ['features-vi', 'features-audio', 'features']);
  // The audio features: a lazy chunk of their own, named after src/features-audio.ts and not pinned either.
  for (const id of ['/game/src/features-audio.ts', '/game/src/features-audio/stingers.ts']) assert.equal(manualChunk(id), undefined, id);
  assert.equal(chunkName({ isEntry: false, name: 'x', moduleIds: ['/game/src/features-audio/radio.ts', 'C:\\game\\src\\features-audio.ts'] }), 'features-audio');
  assert.equal(chunkName({ isEntry: false, name: 'x', moduleIds: ['/game/src/features.ts', '/game/src/features/low-health.ts'] }), 'features');
});

const chunk = (name, modules, imports = [], dynamicImports = []) => ({ name, entry: name === 'index', imports, dynamicImports, modules });
const GOOD = { chunks: {
  'assets/index-a.js': chunk('index', ['src/main.ts', 'src/game-events.ts'], ['assets/rules-b.js'], ['assets/features-c.js', 'assets/modes-e.js']),
  'assets/rules-b.js': chunk('rules', ['src/i18n.ts', 'src/combat.ts'], [], ['assets/vi-pack-f.js']),
  'assets/features-c.js': chunk('features', ['src/features.ts', 'src/features/moments.ts', 'src/story/scenes.ts', 'src/game-services.ts'], ['assets/rules-b.js'], ['assets/features-vi-d.js']),
  'assets/features-vi-d.js': chunk('features-vi', ['src/features-vi/moments.ts']),
  'assets/modes-e.js': chunk('modes', ['src/modes.ts'], ['assets/rules-b.js']),
  'assets/vi-pack-f.js': chunk('vi-pack', ['src/locales/vi-pack.ts']),
} };
const STARTS = { English: ['index.html', 'assets/index-a.js', 'assets/rules-b.js', 'assets/index-a.css'], Vietnamese: ['index.html', 'assets/index-a.js', 'assets/rules-b.js', 'assets/index-a.css', 'assets/vi-pack-f.js'] };
const change = edit => { const map = structuredClone(GOOD); edit(map.chunks); return map; };

test('a build whose lazy chunks are only reached by import() passes the lazy-split check', () => {
  assert.deepEqual(lazySplitProblems(GOOD, STARTS), []);
  // No feature has phrases yet, or no features chunk at all (a build from before them): nothing to complain about.
  assert.deepEqual(lazySplitProblems(change(c => { delete c['assets/features-vi-d.js']; c['assets/features-c.js'].dynamicImports = []; }), STARTS), []);
  assert.deepEqual(lazySplitProblems({ chunks: { 'assets/index-a.js': chunk('index', ['src/main.ts']) } }, { English: ['index.html', 'assets/index-a.js'] }), []);
});

test('a feature module, a story module or a phrase table built into another chunk fails, and so does features.ts itself', () => {
  for (const [module, home, wrong] of [['src/features/moments.ts', 'features', 'index'], ['src/story/scenes.ts', 'features', 'world'], ['src/features.ts', 'features', 'rules'], ['src/features-vi/moments.ts', 'features-vi', 'three'], ['src/features-vi/moments.ts', 'features-vi', 'features']]) {
    const problems = lazySplitProblems(change(c => {
      for (const item of Object.values(c)) item.modules = item.modules.filter(name => name !== module);
      c['assets/wrong.js'] = chunk(wrong, [module, 'src/other.ts']);
    }), STARTS);
    assert.equal(problems.length, 1, `${module} in ${wrong}`);
    assert.equal(problems[0], `${module} is built into the "${wrong}" chunk (assets/wrong.js); it belongs in the lazy "${home}" chunk. See manualChunk in vite.config.ts.`);
  }
  // Rollup folded the whole small chunk into the start: every module of it is named.
  const folded = lazySplitProblems(change(c => { c['assets/index-a.js'].modules.push(...c['assets/features-c.js'].modules); delete c['assets/features-c.js']; c['assets/index-a.js'].dynamicImports = ['assets/modes-e.js']; }), STARTS);
  assert.deepEqual(folded.map(line => line.split(' is built into')[0]), ['src/features.ts', 'src/features/moments.ts', 'src/story/scenes.ts']);
});

test('a start that reaches a lazy chunk by a static import or a modulepreload fails, however far the way', () => {
  const direct = lazySplitProblems(change(c => { c['assets/index-a.js'].imports.push('assets/features-c.js'); }), STARTS);
  assert.deepEqual(direct, ['English', 'Vietnamese'].map(label => `the ${label} start downloads the lazy "features" chunk: assets/index-a.js imports assets/features-c.js. Load it with import() only, and keep what the start needs out of it.`));
  // Through a chunk index.html does not name: rules imports shared, shared imports the phrase tables.
  const far = lazySplitProblems(change(c => { c['assets/rules-b.js'].imports.push('assets/shared-g.js'); c['assets/shared-g.js'] = chunk('shared', ['src/shared.ts'], ['assets/features-vi-d.js']); }), STARTS);
  assert.match(far[0], /^the English start downloads the lazy "features-vi" chunk: assets\/rules-b\.js imports assets\/shared-g\.js imports assets\/features-vi-d\.js\./);
  // index.html itself names it (a modulepreload).
  const preload = lazySplitProblems(GOOD, { English: [...STARTS.English, 'assets/features-c.js'] });
  assert.deepEqual(preload, ['the English start downloads the lazy "features" chunk: index.html names assets/features-c.js. Load it with import() only, and keep what the start needs out of it.']);
  // Only the Vietnamese start: the pack imports the features' phrases.
  const pack = lazySplitProblems(change(c => { c['assets/vi-pack-f.js'].imports.push('assets/features-vi-d.js'); }), STARTS);
  assert.equal(pack.length, 1); assert.match(pack[0], /^the Vietnamese start downloads the lazy "features-vi" chunk: assets\/vi-pack-f\.js imports assets\/features-vi-d\.js\./);
  // A lazy chunk importing the start is the normal direction, and import() from the start is how it loads.
  assert.deepEqual(lazySplitProblems(change(c => { c['assets/features-c.js'].imports.push('assets/index-a.js'); c['assets/rules-b.js'].dynamicImports.push('assets/features-c.js'); }), STARTS), []);
});

test('a chunk map from another build is refused', () => {
  const stale = lazySplitProblems(GOOD, { English: ['index.html', 'assets/index-NEW.js', 'assets/rules-b.js'] });
  assert.deepEqual(stale, ['the chunk map does not know assets/index-NEW.js of the English start: it is from another build. Build again, then run this.']);
});

// A small project, built with the game's chunk rules.
const temp = realpathSync(mkdtempSync(join(tmpdir(), 'lazy-split-')));
after(() => rmSync(temp, { recursive: true, force: true }));
/** Builds { file: text } with manualChunk, chunkName and chunkMap from vite.config.ts; returns the chunk map and the start files. */
async function buildProject(name, files) {
  const root = join(temp, name);
  for (const [file, text] of Object.entries(files)) { mkdirSync(dirname(join(root, file)), { recursive: true }); writeFileSync(join(root, file), text); }
  // The game's own loader and services, as they are.
  for (const file of ['features.ts', 'features-audio.ts', 'game-services.ts', 'asset-url.ts']) cpSync(join(ROOT, 'src', file), join(root, 'src', file));
  await build({ root, configFile: false, logLevel: 'silent', plugins: [chunkMap('map/chunk-map.json')],
    build: { outDir: 'dist', minify: false, rollupOptions: { output: { manualChunks: manualChunk, experimentalMinChunkSize: 24_000, chunkFileNames: item => `assets/${chunkName(item)}-[hash].js` } } } });
  const map = await json(join(root, 'map', 'chunk-map.json'));
  const entry = Object.keys(map.chunks).find(file => map.chunks[file].entry);
  return { map, starts: { English: ['index.html', entry] }, home: module => Object.values(map.chunks).find(item => item.modules.includes(module))?.name, dist: join(root, 'dist') };
}
const PROJECT = {
  'index.html': '<!doctype html><html><body><script type="module" src="/src/main.ts"></script></body></html>',
  // The start: shared code, and the features asked for later, as main.ts loadFeatures does.
  'src/main.ts': "import { t, addPhrases } from './i18n.ts';\nimport { sound } from './sfx.ts';\ndocument.title = t('Zoo') + sound('click');\nconst host = { connect() {} };\nsetTimeout(() => void import('./features.ts').then(m => m.mountFeatures(host as never, addPhrases as never)), 100);\n",
  'src/i18n.ts': "const extra: Record<string, string> = {};\nexport const t = (text: string) => extra[text] ?? text;\nexport async function addPhrases(loader: () => Promise<Record<string, string>>) { Object.assign(extra, await loader()); }\n",
  'src/sfx.ts': "export const sound = (kind: string) => kind.length;\n",
  // A feature that uses start code (a phrase and a sound) and a story module of its own.
  'src/features/moments.ts': "import { t } from '../i18n.ts';\nimport { sound } from '../sfx.ts';\nimport { scene } from '../story/scenes.ts';\nexport function mount(services: { toast(text: string): void }) { services.toast(t('A moment') + sound('pop') + scene); }\n",
  'src/story/scenes.ts': "export const scene = 'The kitchen garden';\n",
  'src/features-vi/moments.ts': "export default { 'A moment': 'Một khoảnh khắc' };\n",
  // An audio feature: it uses start code too, and lands in the audio features' own chunk.
  'src/features-audio/chime.ts': "import { sound } from '../sfx.ts';\nexport function mount(services: { toast(text: string): void }) { services.toast('chime' + sound('ready')); }\n",
};

test('built with the chunk rules of the game, a fixture feature lands in the lazy features chunk and its phrases in features-vi', async () => {
  const { map, starts, home, dist } = await buildProject('good', PROJECT);
  assert.equal(home('src/features.ts'), 'features'); assert.equal(home('src/features/moments.ts'), 'features'); assert.equal(home('src/story/scenes.ts'), 'features');
  assert.equal(home('src/game-services.ts'), 'features', 'the services load with the features');
  assert.equal(home('src/features-vi/moments.ts'), 'features-vi');
  assert.equal(home('src/i18n.ts'), 'index'); assert.equal(home('src/sfx.ts'), 'index', 'what the start needs stays in the start, though a feature imports it too');
  assert.equal(home('src/features-audio/chime.ts'), 'features-audio'); assert.equal(home('src/features-audio.ts'), 'features-audio', 'the audio features are a lazy chunk of their own');
  assert.deepEqual(Object.values(map.chunks).map(item => item.name).sort(), ['features', 'features-audio', 'features-vi', 'index'], 'three lazy chunks beside the start, and no fourth');
  const audio = Object.keys(map.chunks).find(file => map.chunks[file].name === 'features-audio');
  const [entry, features, phrases] = ['index', 'features', 'features-vi'].map(name => Object.keys(map.chunks).find(file => map.chunks[file].name === name));
  assert.deepEqual(map.chunks[entry].imports, []); assert.deepEqual(map.chunks[entry].dynamicImports, [features], 'the start reaches the features by import() only');
  assert.deepEqual([...new Set(map.chunks[features].dynamicImports)].sort(), [phrases, audio].sort(), 'and the features reach their phrases and the audio features by import() only');
  assert.ok(!map.chunks[features].imports.includes(audio) && !map.chunks[entry].dynamicImports.includes(audio), 'the audio chunk is asked for by the features, after they have mounted');
  assert.deepEqual(lazySplitProblems(map, starts), []);
  assert.ok(existsSync(join(dist, features)) && existsSync(join(dist, phrases)));
  assert.ok(!existsSync(join(dist, 'chunk-map.json')) && !existsSync(join(dist, 'map')), 'the map is written outside dist/, so it never joins the install list');
});

test('the same project with a story module imported by the start fails the check', async () => {
  const { map, starts, home } = await buildProject('static', { ...PROJECT, 'src/main.ts': PROJECT['src/main.ts'] + "import { scene } from './story/scenes.ts';\ndocument.body.textContent = scene;\n" });
  assert.notEqual(home('src/story/scenes.ts'), 'features');
  const problems = lazySplitProblems(map, starts);
  assert.equal(problems.length, 1); assert.match(problems[0], /^src\/story\/scenes\.ts is built into the "index" chunk/);
});

// The real build, when there is one.
const MAP = join(ROOT, '.scratch', 'build', 'chunk-map.json');
test('the chunk map of the last build: the features are a lazy chunk of their own', { skip: !existsSync(MAP) && 'no build: run npm run build:pages' }, async () => {
  const { chunks } = await json(MAP), named = name => Object.entries(chunks).filter(([, item]) => item.name === name);
  const features = named('features');
  assert.equal(features.length, 1, 'one features chunk');
  assert.ok(features[0][1].modules.includes('src/features.ts'));
  const [entryFile, entry] = named('index')[0];
  assert.ok(entry.dynamicImports.includes(features[0][0]), 'main.ts loads it with import()');
  // The start as the map sees it: the entry and what it imports statically (index.html modulepreloads exactly those).
  const start = new Set([entryFile]); for (const file of start) for (const next of chunks[file].imports) start.add(next);
  const pack = named('vi-pack').map(([file]) => file);
  assert.deepEqual(lazySplitProblems({ chunks }, { English: [...start], Vietnamese: [...start, ...pack] }), []);
});
