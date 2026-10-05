import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, utimes, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { needsShareBuild, shareBuildEnv } from '../server/share-build.mjs';

test('sharing refuses fresh Pages/unknown artifacts and accepts an unchanged root multiplayer build', async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'zoo-share-build-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  assert.equal(needsShareBuild(root), true);
  await mkdir(path.join(root, 'dist'));
  const index = path.join(root, 'dist', 'index.html'), info = path.join(root, 'dist', 'build-info.json');
  await writeFile(index, '<html>game</html>');
  assert.equal(needsShareBuild(root), true, 'an old build without a mode marker must be rebuilt');
  for (const marker of [{ edition: 'solo', base: '/cute_game/' }, { edition: 'solo', base: '/' }, { edition: 'online', base: '/cute_game/' }]) {
    await writeFile(info, JSON.stringify(marker));
    assert.equal(needsShareBuild(root), true, 'both the hosting mode and path must match');
  }
  await writeFile(info, JSON.stringify({ edition: 'online', base: '/' }));
  assert.equal(needsShareBuild(root), false);
  assert.equal(needsShareBuild(root, true), true);
  for (const name of ['.env.production', 'vite.config.ts', 'package-lock.json']) {
    const input = path.join(root, name);
    await writeFile(input, 'fixture');
    await utimes(input, 2000, 2000); await utimes(index, 1000, 1000);
    assert.equal(needsShareBuild(root), true, `${name} changes invalidate the build`);
    await rm(input);
  }
});

test('a shared build overrides Pages environment variables without dropping server configuration', () => {
  const original = { VITE_BASE_PATH: '/cute_game/', VITE_STATIC_HOST: 'true', PORT: '8787' };
  assert.deepEqual(shareBuildEnv(original), { VITE_BASE_PATH: '/', VITE_STATIC_HOST: 'false', PORT: '8787' });
  assert.equal(original.VITE_STATIC_HOST, 'true');
});
