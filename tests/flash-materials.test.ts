import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { deferFlash, flashMaterialsOf, flashMaterialsSoFar, transferFlash } from '../src/flash-materials.ts';

const shared = () => new T.MeshToonMaterial({ color: '#ffffff', vertexColors: true });
function creature(material: T.Material, parts = 3) {
  const root = new T.Group();
  for (let i = 0; i < parts; i++) root.add(new T.Mesh(new T.BoxGeometry(), material));
  return deferFlash(root);
}

test('a new creature copies no material until it is hit', () => {
  const kit = shared(), a = creature(kit), b = creature(kit);
  assert.equal(flashMaterialsSoFar(a).length, 0);
  a.traverse(o => { if (o instanceof T.Mesh) assert.equal(o.material, kit, 'parts keep the shared kit material'); });
  assert.equal(kit.userData.sharedKit, true, 'the shared material is never freed with one creature');
  assert.equal(b.userData.flashMeshes.length, 3);
});

test('the first flash copies once; the flash tints only that creature', () => {
  const kit = shared(), a = creature(kit), b = creature(kit);
  const own = flashMaterialsOf(a);
  assert.equal(own.length, 3);
  assert.ok(own.every(m => m !== kit && m.color.getHex() === kit.color.getHex() && m.vertexColors));
  own[0].emissive.setRGB(1, 1, 1);
  assert.equal(kit.emissive.getHex(), 0, 'the shared material is untouched');
  assert.equal(flashMaterialsOf(a), own, 'later flashes reuse the copies');
  b.traverse(o => { if (o instanceof T.Mesh) assert.equal(o.material, kit, 'other creatures stay shared'); });
});

test('a shader patch survives the copy and the Vault copies are disposable', () => {
  const kit = shared(); kit.customProgramCacheKey = () => 'patched';
  const a = creature(kit); a.userData.flashOwns = true;
  const [copy] = flashMaterialsOf(a);
  assert.equal(copy.customProgramCacheKey(), 'patched');
  assert.equal(copy.userData.sharedKit, false);
});

test('an adopted model hands its flash state to the creature root', () => {
  const kit = shared(), model = creature(kit), root = new T.Group();
  transferFlash(model, root);
  assert.equal(root.userData.flashMeshes, model.userData.flashMeshes);
  assert.equal(flashMaterialsSoFar(root).length, 0);
  assert.equal(flashMaterialsOf(root).length, 3);
});
