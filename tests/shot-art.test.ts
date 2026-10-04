import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { makeShot, poseShot, lookOf } from '../src/shot-art.ts';

const KINDS = ['pea', 'star', 'wave', 'ice', 'spike', 'fire', 'fireball', 'bubble', 'bigbubble', 'arrow', 'rainbow', 'missile', 'boulder', 'snowball', 'unknown'];

test('every shot kind has a cheap look made from shared geometry and materials', () => {
  const geometries = new Set<string>(), materials = new Set<T.Material>();
  for (const kind of KINDS) {
    for (let i = 0; i < 3; i++) {
      const shot = makeShot(kind, kind === 'snowball' ? 1.5 : .22, '#c4ec9f');
      let meshes = 0; shot.traverse(o => { if (o instanceof T.Mesh) { meshes++; geometries.add(o.geometry.uuid); materials.add(o.material as T.Material); } });
      assert.ok(meshes >= 1 && meshes <= 4, `${kind}: ${meshes} meshes`);
      poseShot(shot, 1, 1, 2, 0, -1, .5); assert.equal(shot.position.y, 1);
    }
  }
  // Three copies of fifteen kinds still share a few geometries and a few dozen materials: no allocation per shot.
  assert.ok(geometries.size <= 12, `${geometries.size} geometries`); assert.ok(materials.size <= 40, `${materials.size} materials`);
  assert.equal(lookOf('wave'), 'crescent'); assert.equal(lookOf('nope'), 'bead');
});

test('a shard points along its flight and a star keeps spinning', () => {
  const shard = makeShot('ice', .22, '#a9eeff'); poseShot(shard, 0, 1, 0, 1, 0, 0); assert.ok(Math.abs(shard.rotation.y - Math.PI / 2) < 1e-9);
  const star = makeShot('star', .22, '#ffe689'); poseShot(star, 0, 1, 0, 0, 1, 0); const a = star.getObjectByName('spin')!.rotation.z; poseShot(star, 0, 1, 0, 0, 1, .1); assert.notEqual(star.getObjectByName('spin')!.rotation.z, a);
});
