import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { PondSplash, SplashGate, SPLASH, effectHits, powerHits, pathTouches, waterPoint, leapAt, type SplashPond } from '../src/pond-splash.ts';
import type { CombatEffect } from '../src/combat.ts';

const pond: SplashPond = { id: 'p', x: 10, z: 0, r: 3, surface: .1, waterId: 'home' };
const ring = (x: number, radius: number, extra: Partial<CombatEffect> = {}): CombatEffect => ({ kind: 'ring', x, z: 0, radius, color: '#fff', ...extra });

test('a big area landing touching the water splashes; a small hit, a far one or a quiet tick does not', () => {
  assert.equal(effectHits([pond], ring(5, 2.5)).length, 1);
  assert.equal(effectHits([pond], ring(2, 2.5)).length, 0);
  assert.equal(effectHits([pond], ring(7.5, .5)).length, 0);
  assert.equal(effectHits([pond], ring(5, 2.5, { quiet: true })).length, 0);
  assert.equal(effectHits([pond], { kind: 'arc', x: 7, z: 0, radius: 3, color: '#fff' }).length, 0);
});
test('a rush runs into the pond along its path', () => {
  assert.ok(pathTouches(pond, 4, 0, Math.PI / 2, 6, 1.2));
  assert.equal(pathTouches(pond, 4, 0, -Math.PI / 2, 6, 1.2), null);
  assert.equal(effectHits([pond], { kind: 'cast', look: 'rush', x: 4, z: 0, radius: 2, color: '#fff', facing: Math.PI / 2 }).length, 1);
});
test('a power strike uses the very area test that picks its creatures', () => {
  assert.equal(powerHits([pond], 'ring', 1, { x: 5, z: 0 }, 0).length, 1);
  assert.equal(powerHits([pond], 'ring', 1, { x: -20, z: 0 }, 0).length, 0);
});
test('the burst rises on the water, never on the bank', () => {
  const w = waterPoint(pond, 0, 0); assert.ok(Math.hypot(w.x - pond.x, w.z) < pond.r);
  assert.deepEqual(waterPoint(pond, 10.5, .5), { x: 10.5, z: .5 });
});
test('each pond rests SPLASH.cooldown seconds between splashes', () => {
  const g = new SplashGate();
  assert.ok(g.ready('a', 0)); assert.ok(!g.ready('a', 1)); assert.ok(g.ready('b', 1)); assert.ok(g.ready('a', SPLASH.cooldown + .01));
});
test('a leap leaves and returns to the surface and peaks at its height', () => {
  const a = leapAt(0, 0, 0, 2, 0, 0, 2), m = leapAt(.5, 0, 0, 2, 0, 0, 2), b = leapAt(1, 0, 0, 2, 0, 0, 2);
  assert.ok(a.y < 0 && b.y < 0); assert.ok(Math.abs(m.y - (2 - .25)) < 1e-9); assert.ok(a.pitch > 0 && b.pitch < 0);
});
test('fish leap and fall back, capped, then leave the scene; reduced motion and no kit leap none', () => {
  const scene = new T.Scene(), calls = { burst: 0, ring: 0 }; let now = 0, reduced = false, kit = true;
  const fx = { density: 1, burst() { calls.burst++; }, ring() { calls.ring++; } } as never;
  const s = new PondSplash({ root: () => scene, fx: () => fx, ponds: () => [pond], fish: () => kit ? { obj: new T.Group(), tail: null } : null, species: () => 'fish_carp', now: () => now, reduced: () => reduced, random: () => .5 });
  s.effect(ring(8, 3)); assert.equal(s.count, 1); assert.equal(s.airborne, SPLASH.leaps); assert.equal(scene.children.length, SPLASH.leaps);
  s.effect(ring(8, 3)); assert.equal(s.count, 1, 'the pond is resting');
  for (let i = 0; i < 90; i++) { now += 1 / 60; s.update(1 / 60); }
  assert.equal(s.airborne, 0); assert.equal(scene.children.length, 0); assert.ok(calls.burst > 2 && calls.ring > 2);
  now += SPLASH.cooldown; reduced = true; s.effect(ring(8, 3)); assert.equal(s.count, 2); assert.equal(s.airborne, 0);
  now += SPLASH.cooldown; reduced = false; kit = false; s.effect(ring(8, 3)); assert.equal(s.count, 3); assert.equal(s.airborne, 0);
  const many: SplashPond[] = [1, 2, 3, 4].map(i => ({ ...pond, id: i, x: 6 + i * .1 }));
  const s2 = new PondSplash({ root: () => scene, fx: () => fx, ponds: () => many, fish: () => ({ obj: new T.Group(), tail: null }), species: () => 'fish_carp', now: () => now, reduced: () => false });
  s2.effect(ring(6, 3)); assert.equal(s2.airborne, SPLASH.fishMax);
});
test('Battery saver leaps one fish', () => {
  const scene = new T.Scene(), fx = { density: .45, burst() {}, ring() {} } as never;
  const s = new PondSplash({ root: () => scene, fx: () => fx, ponds: () => [pond], fish: () => ({ obj: new T.Group(), tail: null }), species: () => 'fish_carp', now: () => 0, reduced: () => false });
  s.effect(ring(8, 3)); assert.equal(s.airborne, SPLASH.leapsLow);
});
