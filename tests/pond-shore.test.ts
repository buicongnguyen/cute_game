import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { World } from '../src/world.ts';
import { blocked, clearSegment } from '../src/navigation.ts';
import { planCast, CAST } from '../src/fishing.ts';

test('ponds leave fish visible without a wooden deck, while water blocks walking and the bank supports casting', () => {
  for (const radius of [3.3, 5.6, 11]) {
    const world = Object.assign(Object.create(World.prototype), { planet: 'home', root: new T.Group(), entities: [], obstacles: [] }) as World;
    const water = { x: -7.5, z: 11.2, r: radius };
    world.makePond(water.x, water.z, radius, 'home');
    const pond = world.entities[0];
    assert.ok(pond.mesh.getObjectByName('pond-water'));
    assert.ok(pond.mesh.getObjectByName('pond-bank'));
    pond.mesh.traverse(node => {
      if (node instanceof T.Mesh) assert.notEqual(node.geometry.type, 'BoxGeometry', 'no deck or planks obscure swimming fish');
    });
    const formerDeck = { x: water.x - radius + Math.min(2.4, radius * .6) * .5, z: water.z };
    assert.equal(blocked(formerDeck, world.obstacles), true);
    const { shore, cast } = planCast(water, { x: water.x - radius - 4, z: water.z }, water);
    assert.equal(blocked(shore, world.obstacles), false);
    assert.equal(clearSegment(shore, water, world.obstacles), false);
    assert.ok(Math.hypot(cast.x - water.x, cast.z - water.z) <= radius - CAST.edgeGap);
    assert.ok(Math.hypot(cast.x - shore.x, cast.z - shore.z) <= CAST.max);
  }
});
