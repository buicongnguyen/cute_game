import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as M from '../src/model.ts';
import { GROWTH, growth, reachBonus, weaponTier, windLook, grownTint, growBlade, heldWindLook } from '../src/weapon-growth.ts';
import { plainBlade } from '../src/trail-ribbon.ts';

test('weapon tiers: shop blades basic, crafted or boss blades 1, rare and dyed premium', () => {
  assert.equal(weaponTier('sword_wood'), 0);
  assert.equal(weaponTier('sword_obsidian'), 1);
  assert.equal(weaponTier('scythe_moon'), 2);
  assert.equal(weaponTier('dye_gilded_sword_crystal'), 2);
  assert.equal(weaponTier(undefined), 0); assert.equal(weaponTier('nope'), 0);
});
test('growth curve: 0 at basic +0, 1 at premium +15, rising with forge and tier, clamped', () => {
  assert.equal(growth(0, 0), 0); assert.equal(growth(15, 2), 1);
  for (let f = 1; f <= 15; f++) assert.ok(growth(f, 0) > growth(f - 1, 0));
  assert.ok(growth(5, 2) > growth(5, 1) && growth(5, 1) > growth(5, 0));
  assert.equal(growth(99, 9), 1); assert.equal(growth(-3, -1), 0); assert.equal(growth(NaN, NaN), 0);
});
test('real reach rises only slightly: at most +0.5 m (premium +15), 0 for a basic +0 blade', () => {
  assert.equal(reachBonus(0, 0), 0); assert.equal(reachBonus(15, 2), GROWTH.reach); assert.ok(GROWTH.reach <= .5);
  assert.equal(reachBonus(15, 0), .4);
});
test('the wind look grows longer and brighter; the tint whitens and glows but stays bounded', () => {
  const a = windLook(0, 0), b = windLook(15, 2);
  assert.deepEqual(a, { length: 1, bright: 1, whiten: 0 });
  assert.ok(b.length > 1.5 && b.bright > 1.5 && b.whiten > 0);
  assert.deepEqual(grownTint([.2, .4, .6], a), [.2, .4, .6]);
  const t = grownTint([.2, .4, .6], b); for (let i = 0; i < 3; i++) assert.ok(t[i] > [.2, .4, .6][i] && t[i] <= 1.8);
  assert.deepEqual(heldWindLook(15, 'gun_pea'), a);
  assert.deepEqual(heldWindLook(15, 'scythe_moon'), b);
});
test('a grown blade keeps its grip and direction and reaches farther', () => {
  const p = plainBlade(1), g = growBlade(p, 1.6);
  assert.deepEqual(g.grip, p.grip); assert.ok(Math.abs(g.length - 1.6) < 1e-9);
  assert.ok(Math.abs(g.tip[1] / g.tip[2] - p.tip[1] / p.tip[2]) < 1e-9 && Math.abs(g.tip[2] - p.tip[2] * 1.6) < 1e-9);
  assert.equal(growBlade(p, 1), p);
});
test('weaponStats (shared by the server) adds the reach to a held, forged sword only', () => {
  const s = M.newGame(); s.bag = { sword_wood: 1, scythe_moon: 1, gun_pea: 1 }; s.gear.weapon = 'sword_wood';
  assert.equal(M.weaponStats(s).range, 2.3);
  s.forge = { sword_wood: 15 }; assert.equal(M.weaponStats(s).range, 2.7);
  s.gear.weapon = 'scythe_moon'; s.forge = { scythe_moon: 15 }; assert.equal(Math.round(M.weaponStats(s).range * 1000) / 1000, 3.8);
  s.gear.weapon = 'gun_pea'; s.forge = { gun_pea: 15 }; assert.equal(M.weaponStats(s).range, 10);
  assert.equal(M.ITEMS.sword_wood.weapon!.range, 2.3, 'the item table itself is untouched');
});
