import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { HAND_DROP, GLOVE, SLEEVE_END, handDrop, sleeveY, fitArmPiece } from '../src/arm-fit.ts';

test('a longer arm stretches the sleeve; the glove rides with the hand and keeps its size', () => {
  const stretch = 3;
  assert.equal(sleeveY(0, stretch), 0, 'the shoulder stays');
  assert.ok(Math.abs(sleeveY(-HAND_DROP, stretch) - (SLEEVE_END * stretch - (HAND_DROP + SLEEVE_END))) < 1e-9, 'the hand centre lands on the hand of the longer arm (the body file: sleeve stretched, hand not)'); assert.equal(handDrop(stretch), -sleeveY(-HAND_DROP, stretch)); assert.equal(sleeveY(.1, stretch), .1, 'the shoulder cap keeps its size');
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
  const box = a.mesh.geometry.boundingBox!; assert.ok(Math.abs(box.min.y - (-.46 + 2 * SLEEVE_END)) < 1e-6 && Math.abs(box.max.y) < 1e-6); assert.ok(Math.abs(box.max.x - .05 * .8) < 1e-6);
  const p = a.mesh.geometry.getAttribute('position'); for (let i = 0; i < p.count; i++) assert.ok(Number.isFinite(p.getY(i)));
});
