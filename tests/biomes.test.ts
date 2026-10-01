import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planDecor, trailDistance, kitsFor, DECOR, HOME_DECOR, PLANET_DECOR, RIM_START, type DecorPlacement } from '../src/biomes.ts';
import { createEnvironmentLayout, zoneAt, terrainHeight } from '../src/environments.ts';
import { seeded } from '../src/space.ts';
import { WORLD_BOUNDS } from '../src/navigation.ts';
import type { PlanetId } from '../src/model.ts';

const plan = (planet: PlanetId, free = () => true) => planDecor({ planet, layout: createEnvironmentLayout(planet), random: seeded(9281), free });
const inside = (pieces: DecorPlacement[]) => pieces.filter(p => Math.hypot(p.x, p.z) < RIM_START - 2);
const border = (pieces: DecorPlacement[]) => pieces.filter(p => Math.hypot(p.x, p.z) >= RIM_START - 2);

test('every player gets the same scenery and obstacles, whichever model files loaded', () => {
  assert.deepEqual(plan('home'), plan('home'));
  assert.deepEqual(plan('lava'), plan('lava'));
  for (const piece of plan('candy')) assert.ok(DECOR[piece.type], `${piece.type} is a known piece`);
});

test('home regions carry their own mix at close to the reference counts, and trails stay clear', () => {
  const pieces = inside(plan('home')), count = (type: string, zone: string) => pieces.filter(p => p.type === type && zoneAt(p) === zone).length;
  for (const [zone, rules] of Object.entries(HOME_DECOR)) for (const [type, target] of rules) {
    const placed = count(type, zone);
    assert.ok(placed >= target * .8, `${zone} ${type}: ${placed} of ${target}`);
  }
  assert.equal(pieces.filter(p => zoneAt(p) === 'canyon' && p.type === 'tree_pine').length, 0, 'no pines in the canyon');
  assert.ok(pieces.filter(p => Math.hypot(p.x, p.z) > 17).every(p => trailDistance(p.x, p.z) >= 2.6), 'the sand trails are walkable');
});

test('pieces never overlap and blocking pieces never stand where something else already is', () => {
  const blocked = { x: 40, z: 0, r: 6 };
  const pieces = inside(plan('home', (x, z, r) => Math.hypot(x - blocked.x, z - blocked.z) >= blocked.r + r));
  assert.ok(pieces.every(p => Math.hypot(p.x - blocked.x, p.z - blocked.z) >= blocked.r), 'nothing inside an existing obstacle');
  const solid = pieces.filter(p => p.radius > 0);
  for (let i = 0; i < solid.length; i++) for (let j = i + 1; j < solid.length; j++) {
    const a = solid[i], b = solid[j];
    assert.ok(Math.hypot(a.x - b.x, a.z - b.z) >= Math.min(a.radius, b.radius), `${a.type} and ${b.type} overlap`);
  }
});

test('the border stands just outside the walkable circle and never blocks', () => {
  const rim = border(plan('home'));
  assert.ok(rim.length > 550, `${rim.length} border pieces`);
  assert.ok(rim.every(p => Math.hypot(p.x, p.z) > WORLD_BOUNDS && p.radius === 0));
  assert.equal(border(plan('cloud')).length, 0, 'the cloud islands have open sky instead');
});

test('planets keep their hazards, islands and seas clear', () => {
  const lava = createEnvironmentLayout('lava');
  assert.ok(inside(plan('lava')).every(p => !lava.pools.some(pool => Math.hypot(p.x - pool.x, p.z - pool.z) < pool.r + 1)), 'nothing in the lava');
  const toy = createEnvironmentLayout('toy');
  assert.ok(inside(plan('toy')).every(p => toy.tracks.every(t => Math.abs(Math.hypot(p.x - t.x, p.z - t.z) - t.r) >= 3)), 'the train tracks are clear');
  const ocean = createEnvironmentLayout('ocean'), sea = inside(plan('ocean'));
  assert.ok(sea.filter(p => p.type === 'coral').every(p => terrainHeight(ocean, p) < -.3), 'coral grows in the sea');
  assert.ok(sea.filter(p => p.type === 'palm').every(p => terrainHeight(ocean, p) === 0), 'palms grow on islands');
  const cloud = createEnvironmentLayout('cloud');
  assert.ok(inside(plan('cloud')).every(p => terrainHeight(cloud, p) === 0), 'cloud scenery stays on the islands');
  for (const planet of Object.keys(PLANET_DECOR) as PlanetId[]) assert.ok(inside(plan(planet)).length > 100, `${planet} is dressed`);
});

test('each world asks only for the scenery files it uses', () => {
  assert.deepEqual(kitsFor('home').sort(), ['scenery', 'wilds']);
  assert.deepEqual(kitsFor('lava'), ['harsh']);
  assert.ok(kitsFor('candy').includes('bright') && kitsFor('candy').includes('wilds'), 'candy needs its sweets and reeds for its ponds');
});
