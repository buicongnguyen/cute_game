import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';

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
