import test from 'node:test';
import assert from 'node:assert/strict';
import { defeatPaysPlayer, inSafeZone, safeRadius, SAFE_ZONE_REWARD_REACH } from '../src/safe-zone.ts';

test('the safe zone is 18 m at home and 11 m elsewhere', () => {
  assert.equal(safeRadius('home'), 18); assert.equal(safeRadius('lava'), 11);
  assert.ok(inSafeZone({ x: 10, z: 10 }, 'home') && !inSafeZone({ x: 20, z: 0 }, 'home') && !inSafeZone({ x: 12, z: 0 }, 'lava'));
});
test('in the safe zone a far fight pays nothing, a near one (a gun at the fence) still does, outside it everything does, and online is left to the server', () => {
  const inside = { x: 0, z: 0 }, far = { x: 40, z: 0 }, near = { x: 14, z: 0 };
  assert.equal(defeatPaysPlayer(inside, far, 'home', false), false, 'a neighbour killing far away pays nothing');
  assert.equal(defeatPaysPlayer(inside, near, 'home', false), true);
  assert.ok(Math.hypot(near.x, near.z) <= SAFE_ZONE_REWARD_REACH);
  assert.equal(defeatPaysPlayer({ x: 25, z: 0 }, far, 'home', false), true, 'fighting outside the safe zone');
  assert.equal(defeatPaysPlayer(inside, far, 'home', true), true, 'online: shared kills follow the server');
});
test('the reward reach covers the longest attack in the kit plus a creature radius', () => {
  assert.equal(SAFE_ZONE_REWARD_REACH, 24);
  assert.equal(defeatPaysPlayer({ x: 0, z: 0 }, { x: 23, z: 0 }, 'home', false), true, 'a snowball kill at 21 m + radius still pays');
  assert.equal(defeatPaysPlayer({ x: 0, z: 0 }, { x: 25, z: 0 }, 'home', false), false);
});
