import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { World } from '../src/world.ts';
import { newGame, type SaveState } from '../src/model.ts';
import { EnvironmentSimulation, createEnvironmentLayout } from '../src/environments.ts';
import { FriendCrew, postFor } from '../src/friend-crew.ts';
import type { Friend } from '../src/friends.ts';
import { idleAfter, idleChoice, lookFor, strollRoute } from '../src/friend-idle.ts';

test('a stroll visits up to three different spots, nearest first, standing off to look at each', () => {
  const spots = Array.from({ length: 8 }, (_, i) => ({ x: i * 2, z: i % 2 }));
  let n = 5; const rand = () => (n = (n * 48271) % 2147483647) / 2147483647;
  const route = strollRoute(spots, { x: 0, z: 5 }, rand);
  assert.equal(route.length, 3); assert.equal(new Set(route.map(r => `${r.at.x},${r.at.z}`)).size, 3);
  for (const stop of route) assert.ok(Math.abs(Math.hypot(stop.x - stop.at.x, stop.z - stop.at.z) - .9) < 1e-9);
  assert.deepEqual(strollRoute([], { x: 0, z: 0 }, rand), []); assert.equal(strollRoute([{ x: 1, z: 1 }], { x: 0, z: 0 }, rand).length, 1);
  assert.ok(idleAfter(() => 0) >= 10 && idleAfter(() => .9999) <= 25 && lookFor(() => 0) >= 2 && lookFor(() => .9999) <= 4);
  assert.equal(idleChoice(() => .1), 'home'); assert.equal(idleChoice(() => .9), 'stroll');
});

function crewWorld(state: SaveState) {
  const w = Object.assign(Object.create(World.prototype), {
    state, scene: new T.Scene(), camera: new T.OrthographicCamera(-3, 3, 3, -3, .1, 20), root: new T.Group(), player: new T.Group(), companion: new T.Group(), position: new T.Vector3(40, 0, 40),
    destination: null, route: [], selected: null, obstacles: [], entities: [], enemies: [], plotMeshes: [], cropSignatures: [], particles: [], keys: new Set<string>(), facing: 0, time: 0, planet: 'home',
    marker: new T.Mesh(), ring: new T.Mesh(), cameraTarget: new T.Vector3(), sun: new T.DirectionalLight(), raycaster: new T.Raycaster(), onInteract() {}, onAttackEnemy() {}, onDamage() {}, onZone() {},
  }) as World;
  w.environment = new EnvironmentSimulation(createEnvironmentLayout('home'));
  return w;
}
test('a helper with no job does not stand at its post for ever: it strolls round the beds and goes home for a rest', () => {
  const s = newGame() as SaveState & { friends?: Friend[] };
  s.friends = [{ id: 'sprout', role: 'garden', rescuedAt: 1, gear: {}, home: true }]; s.bag = {}; for (const p of s.plots) { p.crop = 'radish'; p.plantedAt = Date.now(); p.growDuration = 1e12; } // every bed is growing: nothing to do
  const real = Math.random; let seed = 12345; Math.random = () => (seed = (seed * 48271) % 2147483647) / 2147483647;
  try {
  const w = crewWorld(s), post = postFor('sprout'), poses = new Set<string>();
  const crew = new FriendCrew({ world: w, own: () => s, visiting: () => false, flying: () => false, started: () => true, robotBed: () => undefined, animalAt: () => undefined, perform: async () => undefined, rescued() {}, locked() {}, worked() {}, arrived() {} });
  let far = 0, wentHome = false, back = false;
  for (let i = 0; i < 20 * 300; i++) { // five minutes at 20 steps a second
    crew.update(.05); const a = crew.actors.get('sprout')!; poses.add(a.pose);
    far = Math.max(far, Math.hypot(a.x - post.x, a.z - post.z)); if (a.trip === 2) wentHome = true; if (wentHome && a.trip === 0 && Math.hypot(a.x - post.x, a.z - post.z) < 1) back = true;
  }
  assert.ok(far > 1.5, `it left its post (${far.toFixed(2)} m)`); assert.ok(poses.has('walk'), 'it walked');
  assert.ok(wentHome, "it went into the cottage at some point"); assert.ok(back, 'and came out and returned to its post');
  } finally { Math.random = real; }
});
