import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { BED_HEIGHT, HARVEST_TIME, RIPE_PX, STAGE_SCALE, VIEW_PITCH, bedFlip, bedScale, cropStage, harvestFlight, phonePxPerMetre, popScale, viewBounds } from '../src/crop-cards.ts';
import { GardenBeds } from '../src/garden-beds.ts';

test('crop stages follow the reference: sprout below 50 %, young until ripe, ripe at 100 %', () => {
  assert.equal(cropStage(null, 1), 0);
  assert.deepEqual([0, .2, .49].map(p => cropStage('radish', p)), [1, 1, 1]);
  assert.deepEqual([.5, .99].map(p => cropStage('radish', p)), [2, 2]);
  assert.equal(cropStage('radish', 1), 3);
  assert.deepEqual(STAGE_SCALE, [0, 1.4, .55, 1.25]);
});

test('the atlas is baked along the camera pitch and ripe crops read about 40 px tall on a phone', () => {
  assert.ok(Math.abs(VIEW_PITCH * 180 / Math.PI - 51.5) < .1);
  assert.ok(Math.abs(phonePxPerMetre() - 41.1) < .2);
  assert.ok(Math.abs(BED_HEIGHT * STAGE_SCALE[3] * phonePxPerMetre() - RIPE_PX) < 1e-9);
});

test('view bounds put the pivot at the front ground point and measure the on-screen height', () => {
  // A 1 m cube standing on the ground: from 51.5° its silhouette is the front face plus the foreshortened top.
  const cube = new T.Mesh(new T.BoxGeometry(1, 1, 1).translate(0, .5, 0));
  const b = viewBounds(cube)!, c = Math.cos(VIEW_PITCH), s = Math.sin(VIEW_PITCH);
  assert.equal(b.front, .5); assert.equal(b.left, -.5); assert.equal(b.right, .5);
  assert.ok(Math.abs(b.bottom) < 1e-9, 'the front bottom edge is the pivot');
  assert.ok(Math.abs(b.top - (c + s)) < 1e-9, 'front face (cos) plus the top seen from above (sin)');
  // Every model is normalised to the same height; the sprout to a third of it.
  assert.ok(Math.abs(bedScale(b) * (b.top - b.bottom) - BED_HEIGHT) < 1e-9);
  assert.ok(bedScale(b, true) < bedScale(b) / 3);
});

test('sprout, young and ripe sizes grow in order and the harvest flight matches the reference timing', () => {
  const unit = { front: 0, left: -.25, right: .25, bottom: 0, top: .5 }, sprout = { ...unit, top: .25 };
  const px = (scale: number, b: typeof unit) => scale * (b.top - b.bottom) * phonePxPerMetre();
  const sizes = [px(STAGE_SCALE[1] * bedScale(sprout, true), sprout), px(STAGE_SCALE[2] * bedScale(unit), unit), px(STAGE_SCALE[3] * bedScale(unit), unit)];
  assert.ok(sizes[0] < sizes[1] && sizes[1] < sizes[2], sizes.join(' < '));
  assert.ok(Math.abs(sizes[2] - 40) < 1e-6);
  assert.equal(HARVEST_TIME, .45);
  assert.equal(harvestFlight(0).lift, 0); assert.ok(Math.abs(harvestFlight(.5).lift - 1.6) < 1e-9); assert.ok(Math.abs(harvestFlight(1).lift) < 1e-9);
  assert.ok(Math.abs(harvestFlight(0).scale - 1.4) < 1e-9); assert.ok(Math.abs(harvestFlight(1).scale - .28) < 1e-9);
  assert.equal(popScale(0), 0); assert.equal(popScale(1), 1);
  const flips = Array.from({ length: 33 }, (_, i) => bedFlip(i));
  assert.ok(flips.includes(1) && flips.includes(-1));
});

test('garden beds draw as instances that receive but never cast shadows, rebuilt only on change', () => {
  const beds = new GardenBeds();
  let made = 0;
  const template = () => { made++; const g = new T.Group(); for (const [x, color] of [[0, '#a00'], [1, '#0a0'], [2, '#00a']] as const) { const m = new T.Mesh(new T.BoxGeometry(), new T.MeshStandardMaterial({ color })); m.position.x = x; g.add(m); } return g; };
  const layout = Array.from({ length: 33 }, (_, i) => ({ x: i * 2.25, z: 0 }));
  beds.sync(template, 'boxes', layout);
  // Three plain colours merge into one vertex-coloured mesh: one draw for every bed.
  assert.equal(beds.draws, 1);
  const mesh = beds.group.children[0] as T.InstancedMesh;
  assert.ok(mesh instanceof T.InstancedMesh); assert.equal(mesh.count, 33); assert.equal(mesh.castShadow, false); assert.equal(mesh.receiveShadow, true);
  const m = new T.Matrix4(), p = new T.Vector3(); mesh.getMatrixAt(5, m); p.setFromMatrixPosition(m); assert.equal(p.x, 5 * 2.25);
  beds.sync(template, 'boxes', layout); assert.equal(made, 1, 'same layout: no rebuild');
  beds.sync(template, 'boxes', layout.slice(0, 9)); assert.equal(made, 2); assert.equal((beds.group.children[0] as T.InstancedMesh).count, 9);
  beds.sync(template, 'boxes', []); assert.equal(beds.draws, 0);
});
