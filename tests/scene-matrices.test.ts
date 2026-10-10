// The per-frame matrix pass skips a frozen static tree (scatter tiles) once its matrices have settled, and wakes up
// whenever the tree could have changed: its root moved, a child was added, one was hidden, or it was thawed.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { freezeStaticTree, manageSceneMatrices, matrixStats, thawStaticTree, updateSceneMatrices } from '../src/scene-matrices.ts';
import { perfFlags } from '../src/perf-flags.ts';

function village() {
  const scene = new T.Scene(), root = new T.Group(), tiles = new T.Group(), mover = new T.Group();
  for (let i = 0; i < 20; i++) { const m = new T.Mesh(new T.BoxGeometry(), new T.MeshBasicMaterial()); m.position.set(i, 0, 0); tiles.add(m); }
  mover.add(new T.Mesh(new T.BoxGeometry(), new T.MeshBasicMaterial()));
  root.add(tiles, mover); scene.add(root); freezeStaticTree(tiles); manageSceneMatrices(scene);
  return { scene, root, tiles, mover };
}

test('a settled static tree costs one visit per frame and stays correct', () => {
  const { scene, tiles } = village();
  updateSceneMatrices(scene); const first = matrixStats.visited;
  updateSceneMatrices(scene);
  assert.equal(matrixStats.frozenSkips, 1);
  assert.ok(matrixStats.visited <= first - tiles.children.length, `visited ${matrixStats.visited} of ${first}`);
  assert.equal(tiles.children[7].matrixWorld.elements[12], 7);
});

test('moving the tree root (or a parent) refreshes every child', () => {
  const { scene, root, tiles } = village();
  updateSceneMatrices(scene); updateSceneMatrices(scene);
  root.position.set(0, 0, 5); updateSceneMatrices(scene);
  assert.equal(matrixStats.frozenSkips, 0);
  assert.equal(tiles.children[3].matrixWorld.elements[14], 5);
  tiles.position.x = 100; updateSceneMatrices(scene);
  assert.equal(tiles.children[3].matrixWorld.elements[12], 103);
  updateSceneMatrices(scene); assert.equal(matrixStats.frozenSkips, 1, 'settles again');
});

test('a child added later gets its matrix, and the moving part of the scene still updates', () => {
  const { scene, tiles, mover } = village();
  updateSceneMatrices(scene); updateSceneMatrices(scene);
  const late = new T.Mesh(new T.BoxGeometry(), new T.MeshBasicMaterial()); late.position.set(0, 9, 0); tiles.add(late);
  mover.position.x = 4; updateSceneMatrices(scene);
  assert.equal(late.matrixWorld.elements[13], 9);
  assert.equal(mover.children[0].matrixWorld.elements[12], 4);
});

test('a hidden child keeps the tree awake until it has been shown and updated', () => {
  const { scene, tiles } = village();
  const late = new T.Mesh(new T.BoxGeometry(), new T.MeshBasicMaterial()); late.position.set(0, 3, 0); late.visible = false; tiles.add(late);
  updateSceneMatrices(scene); updateSceneMatrices(scene);
  assert.equal(matrixStats.frozenSkips, 0, 'not settled while a child is hidden');
  late.visible = true; updateSceneMatrices(scene);
  assert.equal(late.matrixWorld.elements[13], 3);
  updateSceneMatrices(scene); assert.equal(matrixStats.frozenSkips, 1);
});

test('thawStaticTree and the flag both bring back the full pass', () => {
  const { scene, tiles } = village();
  updateSceneMatrices(scene); updateSceneMatrices(scene);
  tiles.children[2].position.y = 6; thawStaticTree(tiles); updateSceneMatrices(scene);
  assert.equal(tiles.children[2].matrixWorld.elements[13], 6);
  perfFlags.freezeStaticTrees = false;
  try { updateSceneMatrices(scene); updateSceneMatrices(scene); assert.equal(matrixStats.frozenSkips, 0); tiles.children[2].position.y = 8; updateSceneMatrices(scene); assert.equal(tiles.children[2].matrixWorld.elements[13], 8); }
  finally { perfFlags.freezeStaticTrees = true; }
  updateSceneMatrices(scene); updateSceneMatrices(scene); assert.equal(matrixStats.frozenSkips, 1);
  assert.equal(tiles.children[2].matrixWorld.elements[13], 8);
});

test('three.js raising matrixWorldNeedsUpdate on ancestors (getWorldPosition) does not make the scene look changed', () => {
  const { scene, root, tiles, mover } = village();
  updateSceneMatrices(scene); updateSceneMatrices(scene);
  const probe = new T.Vector3(); mover.children[0].getWorldPosition(probe); // updateWorldMatrix(true): flags root and scene
  assert.equal(root.matrixWorldNeedsUpdate, true, 'the flag is raised by three.js');
  updateSceneMatrices(scene);
  assert.equal(matrixStats.frozenSkips, 1, 'the static tiles are still skipped');
  assert.equal(root.matrixWorldNeedsUpdate, false);
  // ...while a real move above the tiles still refreshes them
  root.position.y = 2; root.children[0].getWorldPosition(probe); updateSceneMatrices(scene);
  assert.equal(tiles.children[0].matrixWorld.elements[13], 2);
});

test('an object with matrixAutoUpdate off still updates through matrixWorldNeedsUpdate', () => {
  const { scene, root } = village();
  const hand = new T.Group(); hand.matrixAutoUpdate = false; root.add(hand); const child = new T.Object3D(); hand.add(child);
  updateSceneMatrices(scene);
  hand.matrix.makeTranslation(7, 0, 0); hand.matrixWorldNeedsUpdate = true; updateSceneMatrices(scene);
  assert.equal(child.matrixWorld.elements[12], 7);
  perfFlags.trustTransforms = false;
  try { hand.matrix.makeTranslation(9, 0, 0); hand.matrixWorldNeedsUpdate = true; updateSceneMatrices(scene); assert.equal(child.matrixWorld.elements[12], 9); }
  finally { perfFlags.trustTransforms = true; }
});
