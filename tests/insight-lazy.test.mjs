import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';

// The Village Almanac must stay out of the first download: main.ts reaches it only through import('./insight.ts').
// insight-history.ts is the one shared piece (model.ts records the save's small history with it).
const read = name => readFile(new URL(`../src/${name}`, import.meta.url), 'utf8');
const staticImports = source => [...source.matchAll(/^import\s+(?!type\b)[^;]*?from\s+['"]([^'"]+)['"]/gm), ...source.matchAll(/^import\s+['"]([^'"]+)['"]/gm)].map(m => m[1].replace(/^\.\//, ''));
const LAZY = /^(insight|insight-[a-z-]+|disguise-profile|disguise-ui)\.(ts|css)$/, SHARED = new Set(['insight-history.ts']);
const lazy = file => LAZY.test(file) && !SHARED.has(file);

test('main.ts loads the Almanac with import() and imports none of its modules statically', async () => {
  const main = await read('main.ts');
  assert.match(main, /import\('\.\/insight\.ts'\)/);
  assert.deepEqual(staticImports(main).filter(lazy), []);
});

test('only the Almanac modules import each other', async () => {
  const bad = [];
  for (const file of (await readdir(new URL('../src/', import.meta.url))).filter(f => f.endsWith('.ts') && !lazy(f))) {
    for (const target of staticImports(await read(file))) if (lazy(target)) bad.push(`${file} -> ${target}`);
  }
  assert.deepEqual(bad, [], 'a static import pulls the Almanac into the first download');
});
