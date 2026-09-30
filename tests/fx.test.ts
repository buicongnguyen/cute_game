import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { Effects, ParticlePool } from '../src/fx.ts';

test('particles share one instanced draw call, fade out and are recycled when full', () => {
  const pool = new ParticlePool(8, false);
  for (let i = 0; i < 5; i++) pool.emit(0, 1, 0, 1, 2, 0, .5, .2, '#ff0000', 0);
  pool.update(.1);
  assert.equal(pool.count, 5); assert.equal(pool.mesh.count, 5);
  for (let i = 0; i < 10; i++) pool.emit(0, 1, 0, 0, 0, 0, 1, .2, '#00ff00', 0);
  assert.equal(pool.count, 8, 'the pool never grows past its size');
  pool.update(.6);
  assert.ok(pool.count >= 3 && pool.count <= 8, 'short-lived sparks expire while newer ones remain');
  pool.update(1); assert.equal(pool.count, 0); assert.equal(pool.mesh.count, 0);
});

test('homing orbs arrive at their target and report it once', () => {
  const pool = new ParticlePool(4, true), target = new T.Vector3(3, 0, 0); let arrived = 0;
  pool.emit(0, 1, 0, 0, 4, 0, 3, .4, '#ffe45c', 4, () => target, () => arrived++, .1);
  for (let i = 0; i < 200 && pool.count; i++) pool.update(1 / 60);
  assert.equal(arrived, 1); assert.equal(pool.count, 0);
});

test('particle density scales bursts, and hit-stop and shake settle over time', () => {
  const scene = new T.Scene(), fx = new Effects(scene, new T.PerspectiveCamera());
  fx.density = .5; fx.burst({ x: 0, z: 0 }, { n: 10 });
  assert.equal(fx.sparks.count, 5);
  fx.ring({ x: 0, z: 0 }); fx.slash({ x: 0, z: 0 }, 0); fx.flash({ x: 0, z: 0 });
  assert.equal(fx.activeCount, 8);
  fx.shake(.4); fx.freeze(.06);
  const offset = new T.Vector3(); fx.shakeOffset(.01, offset); assert.ok(offset.length() > 0);
  for (let i = 0; i < 60; i++) { fx.shakeOffset(1 / 60, offset); fx.update(1 / 60); }
  assert.equal(offset.length(), 0); assert.equal(fx.activeCount, 0, 'rings, slashes and flashes clean themselves up');
  fx.clear(); assert.equal(fx.hitstop, 0);
});
