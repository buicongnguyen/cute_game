import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { loadWithRetry, wakeArt, failingArt, onArtStatus, onArtLoaded, DEFAULT_POLICY, type RetryPolicy } from '../src/art-retry.ts';
import { RefinedAssetLibrary, KitLibrary, HeroLibrary, modelUrl } from '../src/assets.ts';
import { World } from '../src/world.ts';

/** The browser schedule (1 s, 3 s, 10 s) with the waits recorded instead of slept. */
function policy() {
  const slept: number[] = [];
  const p: RetryPolicy = { delays: [1000, 3000, 10000], sleep: async ms => { slept.push(ms); }, wake: DEFAULT_POLICY.wake };
  return { p, slept };
}
/** A loader that fails its first `failures` calls. */
function flaky<V>(failures: number, value: () => V) {
  let calls = 0;
  return { load: async () => { calls++; if (calls <= failures) throw new Error('network'); return value(); }, get calls() { return calls; } };
}
const settle = () => new Promise(resolve => setTimeout(resolve, 0));
function kitScene(name = 'tree_round') {
  const scene = new T.Group(), node = new T.Group(); node.name = name;
  node.add(new T.Mesh(new T.BoxGeometry(), new T.MeshStandardMaterial())); scene.add(node); return scene;
}

test('a failed load retries after 1 s, 3 s and 10 s and returns the first success', async () => {
  const { p, slept } = policy(), source = flaky(2, () => 'model');
  assert.equal(await loadWithRetry('a.glb', source.load, () => assert.fail('not late'), p), 'model');
  assert.deepEqual(slept, [1000, 3000]); assert.equal(source.calls, 3);
});

test('after the quick retries the load waits for a wake-up, then reports the late model', async () => {
  const { p, slept } = policy(), source = flaky(5, () => 'model'), late: string[] = [], loaded: string[] = [];
  let statusCalls = 0;
  const offStatus = onArtStatus(() => statusCalls++), offLoaded = onArtLoaded(url => loaded.push(url));
  assert.equal(await loadWithRetry('b.glb', source.load, v => late.push(v), p), undefined);
  assert.deepEqual(slept, [1000, 3000, 10000]); assert.equal(source.calls, 4);
  assert.ok(failingArt().includes('b.glb')); assert.equal(statusCalls, 1);
  wakeArt(); await settle();
  assert.equal(source.calls, 5); assert.deepEqual(late, []); assert.ok(failingArt().includes('b.glb'), 'a failed wake-up keeps waiting');
  wakeArt(); await settle();
  assert.deepEqual(late, ['model']); assert.deepEqual(loaded, ['b.glb']); assert.equal(failingArt().includes('b.glb'), false);
  assert.equal(statusCalls, 2);
  offStatus(); offLoaded();
});

test('a kit whose file failed becomes ready, with its models, when a later retry succeeds', async () => {
  const { p } = policy(), source = flaky(4, () => kitScene());
  const kit = new KitLibrary(['kit.glb'], source.load, p);
  await kit.load();
  assert.equal(kit.ready, false); assert.equal(kit.instance('tree_round'), null);
  wakeArt(); await settle();
  assert.equal(kit.ready, true); assert.ok(kit.instance('tree_round'));
});

test('refined buildings and the explorer swap in after a late success', async () => {
  const { p } = policy(), source = flaky(4 * 9, () => { const g = new T.Group(); g.add(new T.Mesh(new T.BoxGeometry(), new T.MeshStandardMaterial())); return g; });
  const assets = new RefinedAssetLibrary(source.load, p);
  await assets.loadAll();
  assert.equal(assets.has('cottage'), false);
  wakeArt(); await settle();
  assert.equal(assets.has('cottage'), true); assert.ok(assets.clone('market'));
  const heroSource = flaky(4, () => kitScene('hero')), hero = new HeroLibrary('hero.glb', heroSource.load, p);
  await hero.load(); assert.equal(hero.ready, false);
  wakeArt(); await settle(); assert.equal(hero.ready, true);
});

test('the world swaps every kind of stand-in when late art arrives', () => {
  const calls: string[] = [], stub = Object.create(World.prototype) as World & Record<string, unknown>;
  for (const name of ['applyRefinedAssets', 'refreshScenery', 'refreshAvatars', 'restyleCreatures']) stub[name] = () => calls.push(name);
  stub.farmView = { refresh: () => calls.push('farm') } as unknown as World['farmView'];
  stub.refreshArt();
  assert.deepEqual(calls, ['applyRefinedAssets', 'refreshScenery', 'refreshAvatars', 'restyleCreatures', 'farm']);
});

test('model URLs stay plain without a build (Node, dev server)', () => {
  assert.equal(modelUrl('cottage.glb'), '/assets/models/cottage.glb');
});
