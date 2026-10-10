// Merged outline hulls are built once per kit part and placement and shared, with identical geometry to a fresh build.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { addOutlines, clearHullCache, hullCacheSize, HULL_CACHE_MAX } from '../src/outline.ts';
import { perfFlags } from '../src/perf-flags.ts';
import { disposeTree } from '../src/dispose-tree.ts';

const geo = new T.BoxGeometry(1, 2, 1), geo2 = new T.SphereGeometry(.5, 8, 6);
function person(x = 0) {
  const root = new T.Group(), arm = new T.Group(); arm.name = 'arm';
  const a = new T.Mesh(geo, new T.MeshToonMaterial()), b = new T.Mesh(geo2, new T.MeshToonMaterial()); b.position.set(x, 1, 0);
  arm.add(a, b); root.add(arm); return root;
}
const hullOf = (root: T.Object3D) => root.userData.outlines[0] as T.Mesh;

test('two people made from the same parts share one hull geometry', () => {
  clearHullCache();
  const p = person(), q = person();
  addOutlines(p, { merge: true }); addOutlines(q, { merge: true });
  assert.equal(hullOf(p).geometry, hullOf(q).geometry);
  assert.equal(hullCacheSize(), 1);
});

test('a different placement or part gets its own hull, and the cached hull equals a fresh one', () => {
  clearHullCache();
  const p = person(0), q = person(.5);
  addOutlines(p, { merge: true }); addOutlines(q, { merge: true });
  assert.notEqual(hullOf(p).geometry, hullOf(q).geometry);
  perfFlags.cacheHulls = false;
  try {
    const fresh = person(0); addOutlines(fresh, { merge: true });
    const a = hullOf(p).geometry.getAttribute('position'), b = hullOf(fresh).geometry.getAttribute('position');
    assert.equal(a.count, b.count);
    assert.deepEqual(Array.from(a.array as Float32Array), Array.from(b.array as Float32Array));
    const na = hullOf(p).geometry.getAttribute('normal'), nb = hullOf(fresh).geometry.getAttribute('normal');
    assert.deepEqual(Array.from(na.array as Float32Array), Array.from(nb.array as Float32Array));
  } finally { perfFlags.cacheHulls = true; }
});

test('disposing one person leaves the shared hull alive for the next', () => {
  clearHullCache();
  const p = person(), q = person(); addOutlines(p, { merge: true }); addOutlines(q, { merge: true });
  let disposed = 0; hullOf(p).geometry.addEventListener('dispose', () => { disposed++; });
  disposeTree(p);
  assert.equal(disposed, 0);
});

test('the cache is bounded', () => {
  clearHullCache();
  for (let i = 0; i < HULL_CACHE_MAX + 20; i++) addOutlines(person(i * .01 + 1), { merge: true });
  assert.equal(hullCacheSize(), HULL_CACHE_MAX);
});
