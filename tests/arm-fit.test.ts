import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { HAND_DROP, GLOVE, sleeveY, fitArmPiece } from '../src/arm-fit.ts';

test('a longer arm stretches the sleeve; the glove rides with the hand and keeps its size', () => {
  const stretch = 3;
  assert.equal(sleeveY(0, stretch), 0, 'the shoulder stays');
  assert.ok(Math.abs(sleeveY(.148, stretch) - .148 * stretch) < 1e-9, 'the cap of a sleeve above the shoulder stretches as the body’s own shoulder does, not with the sleeve (no horn beside the head)'); assert.ok(sleeveY(.01, stretch) > sleeveY(-.01, stretch));
  assert.ok(Math.abs(sleeveY(-HAND_DROP, stretch) + HAND_DROP * stretch) < 1e-9, 'the hand centre lands on the hand of the longer arm');
  const cuff = -(HAND_DROP - GLOVE), tip = -(HAND_DROP + .1);
  assert.ok(Math.abs((sleeveY(cuff, stretch) - sleeveY(tip, stretch)) - (cuff - tip)) < 1e-9, 'from the cuff to the fingertips nothing is stretched');
  for (let y = 0, last = 1; y >= -.5; y -= .01) { const out = sleeveY(y, stretch); assert.ok(out < last, 'monotonic: nothing folds'); last = out; }
  assert.equal(sleeveY(-.2, 1), -.2); assert.ok(Math.abs(sleeveY(-.2, .9) + .18) < 1e-9);
});

test('fitArmPiece bakes a piece once per shape, flags it shared and leaves identity transforms', () => {
  const part = new T.Group(), shared = new T.BoxGeometry(.1, .46, .1);
  const make = () => { const piece = new T.Group(), mesh = new T.Mesh(shared, new T.MeshBasicMaterial()); mesh.position.y = -.23; piece.add(mesh); part.add(piece); return { piece, mesh }; };
  const a = make(); fitArmPiece(a.piece, .8, 3); const b = make(); fitArmPiece(b.piece, .8, 3);
  assert.equal(a.mesh.geometry, b.mesh.geometry, 'the same source and stretch share one baked geometry');
  assert.notEqual(a.mesh.geometry, shared); assert.equal(a.mesh.geometry.userData.sharedKit, true);
  assert.deepEqual(a.mesh.position.toArray(), [0, 0, 0]);
  const box = a.mesh.geometry.boundingBox!; assert.ok(Math.abs(box.min.y - (-.46 - 2 * HAND_DROP)) < 1e-6 && Math.abs(box.max.y) < 1e-6); assert.ok(Math.abs(box.max.x - .05 * .8) < 1e-6);
  const p = a.mesh.geometry.getAttribute('position'); for (let i = 0; i < p.count; i++) assert.ok(Number.isFinite(p.getY(i)));
});
