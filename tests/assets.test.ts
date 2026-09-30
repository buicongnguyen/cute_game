import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { RefinedAssetLibrary, REFINED_ASSET_FILES } from '../src/assets.ts';

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
