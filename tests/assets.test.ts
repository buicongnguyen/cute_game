import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { RefinedAssetLibrary, REFINED_ASSET_FILES, KitLibrary, isShared } from '../src/assets.ts';
import { World } from '../src/world.ts';

function model() {
  const source = new T.Group();
  const part = new T.Mesh(new T.BoxGeometry(), new T.MeshStandardMaterial({ color: '#cfb179' }));
  source.add(part);
  return { source, part };
}

test('refined models load once even when requested concurrently', async () => {
  const { source } = model();
  const calls: string[] = [];
  const assets = new RefinedAssetLibrary(async url => { calls.push(url); return source; });
  assert.equal(assets.clone('cottage'), null);
  await Promise.all([assets.loadAll(), assets.loadAll()]);
  await assets.loadAll();
  assert.deepEqual(calls.sort(), Object.values(REFINED_ASSET_FILES).sort());
  assert.ok(assets.clone('cottage'));
});

test('disposing an imported world instance cannot invalidate later instances or the cache', async () => {
  const { source, part } = model();
  let sourceDisposals = 0;
  part.geometry.addEventListener('dispose', () => sourceDisposals++);
  part.material.addEventListener('dispose', () => sourceDisposals++);
  const assets = new RefinedAssetLibrary(async () => source);
  await assets.loadAll();
  const first = assets.clone('garden')!, second = assets.clone('garden')!;
  const firstMesh = first.children[0] as T.Mesh<T.BufferGeometry, T.MeshStandardMaterial>;
  const secondMesh = second.children[0] as T.Mesh<T.BufferGeometry, T.MeshStandardMaterial>;
  assert.notEqual(firstMesh.geometry, part.geometry);
  assert.notEqual(firstMesh.geometry, secondMesh.geometry);
  assert.notEqual(firstMesh.material, part.material);
  assert.notEqual(firstMesh.material, secondMesh.material);
  firstMesh.material.color.set('#ffffff');
  firstMesh.geometry.dispose();
  firstMesh.material.dispose();
  assert.equal(sourceDisposals, 0);
  assert.equal(secondMesh.material.color.getHexString(), 'cfb179');
  assert.equal((assets.clone('garden')!.children[0] as typeof firstMesh).material.color.getHexString(), 'cfb179');
  assert.equal(firstMesh.castShadow, true);
  assert.equal(firstMesh.receiveShadow, true);
});

test('a missing model retains its fallback without blocking the other models', async () => {
  const { source } = model();
  const assets = new RefinedAssetLibrary(async url => {
    if (url.endsWith('cottage.glb')) throw new Error('Unavailable model');
    return source;
  });
  await assets.loadAll();
  assert.equal(assets.clone('cottage'), null);
  assert.ok(assets.clone('market'));
  assert.ok(assets.clone('garden'));
});

test('all materials in an imported mesh material array are independent', async () => {
  const source = new T.Group();
  const materials = [new T.MeshStandardMaterial(), new T.MeshStandardMaterial()];
  source.add(new T.Mesh(new T.BoxGeometry(), materials));
  const assets = new RefinedAssetLibrary(async () => source);
  await assets.loadAll();
  const clone = assets.clone('outfitters')!.children[0] as T.Mesh<T.BufferGeometry, T.Material[]>;
  assert.notEqual(clone.material, materials);
  clone.material.forEach((material, index) => assert.notEqual(material, materials[index]));
});

function kitScene() {
  const scene = new T.Group();
  const tree = new T.Group(); tree.name = 'tree_round'; tree.position.set(4, 0, 0);
  const leaves = new T.MeshStandardMaterial({ color: '#4fbf3a' }); leaves.name = 'Leaf A';
  const bark = new T.MeshStandardMaterial({ color: '#8e5634' }); bark.name = 'Bark';
  const trunk = new T.Mesh(new T.CylinderGeometry(), bark), crown = new T.Mesh(new T.SphereGeometry(), leaves);
  crown.position.y = 2; tree.add(trunk, crown); scene.add(tree);
  return { scene, leaves, bark };
}

test('kit instances share geometry and materials and are placed at their own origin', async () => {
  const { scene, leaves } = kitScene();
  const kit = new KitLibrary(['scenery.glb'], async () => scene);
  assert.equal(kit.instance('tree_round'), null);
  await kit.load();
  assert.equal(kit.ready, true);
  const a = kit.instance('tree_round')!, b = kit.instance('tree_round')!;
  const crownA = a.children[1] as T.Mesh, crownB = b.children[1] as T.Mesh;
  assert.equal(crownA.geometry, crownB.geometry);
  assert.equal(crownA.material, leaves);
  assert.equal(crownA.position.y, 2);
  assert.equal(a.position.x, 0, 'the node offset inside the GLB is not baked into instances');
  assert.ok(isShared(crownA.geometry) && isShared(leaves));
});

test('kit tints are cached per colour and never alter the source material', async () => {
  const { scene, leaves } = kitScene();
  const kit = new KitLibrary(['scenery.glb'], async () => scene);
  await kit.load();
  const pink = kit.instance('tree_round', { 'Leaf A': '#ff8fc4' })!, again = kit.instance('tree_round', { 'Leaf A': '#ff8fc4' })!;
  const tinted = (pink.children[1] as T.Mesh).material as T.MeshStandardMaterial;
  assert.equal(tinted, (again.children[1] as T.Mesh).material);
  assert.equal(tinted.color.getHexString(), 'ff8fc4');
  assert.equal(leaves.color.getHexString(), '4fbf3a');
  assert.ok(isShared(tinted));
});

test('disposing a world leaves shared kit resources usable', async () => {
  const { scene, leaves } = kitScene();
  const kit = new KitLibrary(['scenery.glb'], async () => scene);
  await kit.load();
  const instance = kit.instance('tree_round')!, crown = instance.children[1] as T.Mesh;
  let disposals = 0;
  crown.geometry.addEventListener('dispose', () => disposals++);
  leaves.addEventListener('dispose', () => disposals++);
  World.prototype.disposeTree.call({} as World, instance);
  assert.equal(disposals, 0);
});

test('an unavailable kit keeps the procedural scenery', async () => {
  const kit = new KitLibrary(['missing.glb'], async () => { throw new Error('404'); });
  await kit.load();
  assert.equal(kit.ready, false);
  assert.equal(kit.instance('tree_round'), null);
});
