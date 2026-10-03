import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as T from 'three';
import * as M from '../src/model.ts';
import { FarmPenView } from '../src/farm-view.ts';
import { penHtml } from '../src/farm-ui.ts';
import { DogFollowView } from '../src/dog-follow.ts';
import { GuardDogs, dogCoatOf } from '../src/dog-world.ts';
import { DOG_FAR, DOG_LEASH, dogFollows, leashSpot, newDogLink, stepDog, trailSpot } from '../src/guard-dog.ts';
import { INDOOR_Y } from '../src/house.ts';

const now = 1_000_000;
const home = () => { const s = M.newGame(); s.level = 30; s.energy = 100_000; s.farm.built = true; return s; };
const ui = { esc: (v: string) => v, mini: (v: string) => v } as unknown as Parameters<typeof penHtml>[1];

test('the dog follows only away from the safe village: wilds and other planets yes, village and cottage no', () => {
  assert.equal(dogFollows('home', { x: 0, z: 0 }), false);
  assert.equal(dogFollows('home', { x: 6, z: -8 }), false);
  assert.equal(dogFollows('home', { x: 40, z: 0 }), true);
  assert.equal(dogFollows('home', { x: 40, z: 0 }, true), false, 'indoors counts as home');
  assert.equal(dogFollows('home', { x: 40, z: 0, y: INDOOR_Y }), false, 'an indoor pose on the wire counts as home');
  assert.equal(dogFollows('candy', { x: 0, z: 0 }), true);
});

test('pen -> follow -> return -> pen: picked up at the pen, trails smoothly, trots back and hands over at the leash', () => {
  const d = newDogLink(), pen = { x: 0, z: -8 }, leash = leashSpot(pen, null);
  const player = { x: 20, z: 0 };
  // Leaving the circle: it starts where the pen had it, not at the explorer.
  assert.equal(stepDog(d, 1 / 60, true, player, 0, { x: 1, z: -7 }, leash), 'follow');
  assert.ok(Math.hypot(d.x - 1, d.z + 7) < .2);
  let maxStep = 0;
  for (let i = 0; i < 60 * 12; i++) { player.x += 3 / 60; const bx = d.x, bz = d.z; stepDog(d, 1 / 60, true, player, Math.PI / 2, null, leash); maxStep = Math.max(maxStep, Math.hypot(d.x - bx, d.z - bz)); }
  const trail = trailSpot(player, Math.PI / 2);
  assert.ok(Math.hypot(d.x - trail.x, d.z - trail.z) < 1.6, 'keeps up with a walking explorer');
  assert.ok(maxStep < 11.1 / 60, 'never jumps while catching up');
  // Back home: it trots to the pen spot and then the pen takes it.
  let place = stepDog(d, 1 / 60, false, player, 0, null, leash); assert.equal(place, 'return');
  d.x = leash.x + 10; d.z = leash.z;
  for (let i = 0; i < 60 * 10 && place !== 'pen'; i++) place = stepDog(d, 1 / 60, false, player, 0, null, leash);
  assert.equal(place, 'pen'); assert.ok(Math.hypot(d.x - leash.x, d.z - leash.z) < .7);
});

test('on another planet it appears beside the explorer, follows, and is placed again after a long ride', () => {
  const d = newDogLink(), player = { x: 5, z: 5 };
  stepDog(d, 1 / 60, true, player, 0, null, null);
  assert.equal(d.place, 'follow'); assert.ok(Math.hypot(d.x - player.x, d.z - player.z) < 2.5);
  player.x += DOG_FAR + 10; stepDog(d, 1 / 60, true, player, 0, null, null);
  const t = trailSpot(player, 0); assert.ok(Math.hypot(d.x - t.x, d.z - t.z) < .01, 'never stuck far behind');
  // No pen in this world: arriving at a safe place just drops it to 'pen' without a trot.
  assert.equal(stepDog(d, 1 / 60, false, player, 0, null, null), 'pen');
});

test('the dog trails on the side away from the pet', () => {
  for (const f of [0, 1, 2.5, -2]) {
    const p = { x: 3, z: 4 }, dog = trailSpot(p, f), pet = { x: p.x - Math.sin(f) * 1.1 + Math.cos(f) * .9, z: p.z - Math.cos(f) * 1.1 - Math.sin(f) * .9 };
    assert.ok(Math.hypot(dog.x - pet.x, dog.z - pet.z) > 1.6);
    assert.ok(Math.hypot(dog.x - p.x, dog.z - p.z) < 1.8);
  }
});

test('at the pen the dog stays on its leash, rests in several ways, strolls and never runs from the explorer', () => {
  for (const house of [null, { x: 4, z: -9 }]) {
    const s = home(); M.buyAnimal(s, 'dog', now); if (house) s.farm.speciesPens = { dog: house };
    const view = new FarmPenView(3, { mobile: false });
    view.setArea({ home: { x: M.PEN.x, z: M.PEN.z, rx: M.YARD.rx, rz: M.YARD.rz }, radius: 15.2, blocked: () => false });
    view.setSpeciesPens(s.farm.speciesPens);
    const spot = leashSpot(M.PEN, house), rests = new Set<string>(); let far = 0, walked = 0;
    for (let i = 0; i < 20 * 600; i++) {
      // The explorer walks right past now and then.
      const player = i % 2000 < 200 ? { x: spot.x + 1, z: spot.z } : { x: 0, z: 10 };
      view.update(s.farm.animals, .05, i * .05, now, player);
      const a = view.activities()[0]; far = Math.max(far, Math.hypot(a.x - spot.x, a.z - spot.z)); if (a.walking) walked++; else rests.add(a.rest);
    }
    assert.ok(far < DOG_LEASH + .6, `stays within the leash (max ${far.toFixed(2)} m)`);
    assert.ok(walked > 100, 'strolls now and then');
    for (const r of ['sit', 'peck', 'look']) assert.ok(rests.has(r), `rests: ${[...rests]}`);
    view.dispose();
  }
});

test('the pen hands the dog out and takes it back where it arrives; it is not drawn or chasing meanwhile', () => {
  const s = home(), dog = M.buyAnimal(s, 'dog', now)!; M.buyAnimal(s, 'chicken', now);
  const view = new FarmPenView(3, { mobile: false }); view.update(s.farm.animals, .05, 0, now);
  const before = view.draws; view.setDogAway(true); view.update(s.farm.animals, .05, .05, now);
  assert.ok(view.draws < before, 'the away dog costs no pen draws');
  assert.equal(view.guardBite({ x: 0, z: 0 }), false, 'no chase from the pen while it is out');
  view.setDogAway(false, { x: 2, z: -6 }); assert.deepEqual(view.positionOf(dog.uid), { x: 2, z: -6 });
  view.update(s.farm.animals, .05, .1, now); assert.equal(view.draws, before);
  view.dispose();
});

test('guarding is the dog\'s job wherever it walks: bite damage and the farm text match', () => {
  const s = home(); M.buyAnimal(s, 'dog', now);
  const bite = M.guardBiteDamage(s, now); assert.equal(bite, 18); assert.ok(M.hasGuardDog(s, now));
  // Nothing about the explorer's whereabouts is saved or read by the guard rule.
  s.planet = 'candy'; assert.equal(M.guardBiteDamage(s, now), bite);
  const html = penHtml(s, ui, now); assert.match(html, /guards the garden either way/);
  assert.doesNotMatch(html, /Guard dogs stay with you/);
});

test('the world hands your dog between pen and follower by zone and planet; other explorers\' dogs follow them', () => {
  const s = home(); M.buyAnimal(s, 'dog', now);
  const scene = new T.Scene(), farmView = new FarmPenView(3, { mobile: false });
  farmView.setArea({ home: { x: M.PEN.x, z: M.PEN.z, rx: M.YARD.rx, rz: M.YARD.rz }, radius: 15.2, blocked: () => false });
  const host = { scene, planet: 'home', position: new T.Vector3(0, 0, 4), facing: 0, boarded: false, time: 0, state: s, farmView, interior: null as unknown, remotePlayers: new Map<string, { mesh: T.Object3D; pose: { facing?: number; dog?: number | null } }>() };
  const dogs = new GuardDogs(), run = (sec: number, move?: () => void) => { for (let i = 0; i < sec * 30; i++) { move?.(); host.time += 1 / 30; farmView.update(s.farm.animals, 1 / 30, host.time, now, host.position); dogs.update(host, 1 / 30); } };
  run(2); assert.equal(dogs.place, 'pen'); assert.equal(dogs.view.count, 0);
  // Walking out of the village: it comes along.
  run(8, () => { host.position.x = Math.min(30, host.position.x + .15); host.facing = Math.PI / 2; });
  assert.equal(dogs.place, 'follow'); assert.ok(farmView.isDogAway); assert.equal(dogs.view.count, 1);
  assert.ok(Math.hypot(dogs.link.x - host.position.x, dogs.link.z - host.position.z) < 2.5);
  // Indoors counts as home even if the stored x/z are the cottage's.
  host.interior = {}; run(.2); assert.equal(dogs.place, 'return'); host.interior = null; run(.2); assert.equal(dogs.place, 'follow');
  // Another planet: it lands beside you.
  host.planet = 'candy'; host.farmView = undefined as unknown as FarmPenView; host.position.set(-40, 0, 12); run(.5);
  assert.equal(dogs.place, 'follow'); assert.ok(Math.hypot(dogs.link.x + 40, dogs.link.z - 12) < 2.5);
  // Landing home on the pad: it trots back to its pen and the pen takes it over.
  host.planet = 'home'; host.farmView = farmView; host.position.set(-6, 0, 6); run(.1); assert.equal(dogs.place, 'return');
  run(10); assert.equal(dogs.place, 'pen'); assert.equal(farmView.isDogAway, false); assert.equal(dogs.view.count, 0);
  // A visitor's own dog stays at their pen; other explorers with a `dog` pose bring theirs.
  const mesh = new T.Group(); mesh.position.set(30, 0, 0); host.remotePlayers.set('friend', { mesh, pose: { facing: 0, dog: 1 } });
  run(.5); assert.equal(dogs.view.count, 1); host.remotePlayers.get('friend')!.pose.dog = null; run(.1); assert.equal(dogs.view.count, 0);
  assert.equal(dogCoatOf(M.newGame()), null);
  dogs.dispose(); farmView.dispose();
});

test('dogs cost four draws however many there are, with one shadow caster', () => {
  const view = new DogFollowView();
  view.update(1 / 60, 0, [{ key: 'me', x: 0, z: 0, heading: 0, coat: 0 }]);
  assert.equal(view.draws, 4); const one = view.draws;
  view.update(1 / 60, .1, Array.from({ length: 9 }, (_, i) => ({ key: `d${i}`, x: i, z: 0, heading: 0, coat: i % 3 })));
  assert.equal(view.draws, one); assert.equal(view.count, 9);
  let casters = 0; view.group.traverse(o => { if (o instanceof T.InstancedMesh && o.castShadow) casters++; }); assert.equal(casters, 1);
  view.group.traverse(o => { if (o instanceof T.InstancedMesh) for (let i = 0; i < o.count; i++) { const m = new T.Matrix4(); o.getMatrixAt(i, m); assert.ok(m.elements.every(Number.isFinite)); } });
  view.update(1 / 60, .2, []); assert.equal(view.draws, 0); view.dispose();
});

test('farm.glb has the puppy with the farm animal part contract, its coat materials and the triangle budget', () => {
  const buf = readFileSync(new URL('../public/assets/models/farm.glb', import.meta.url)), len = buf.readUInt32LE(12);
  const doc = JSON.parse(buf.subarray(20, 20 + len).toString('utf8'));
  const dog = doc.nodes.find((n: { name: string }) => n.name === 'dog'); assert.ok(dog);
  const kids = dog.children.map((i: number) => doc.nodes[i]), names = kids.map((n: { name: string }) => n.name).sort();
  assert.deepEqual(names, ['dog_body', 'dog_head', 'dog_leg_bl', 'dog_leg_br', 'dog_leg_fl', 'dog_leg_fr', 'dog_tail']);
  let tris = 0; const mats = new Set<string>();
  for (const n of kids) {
    assert.ok(n.translation && n.translation.every(Number.isFinite), `${n.name} has its hinge as translation`); assert.ok(!n.rotation && !n.scale);
    for (const p of doc.meshes[n.mesh].primitives) { tris += doc.accessors[p.indices].count / 3; mats.add(doc.materials[p.material].name); }
  }
  assert.ok(tris <= 1500, `${tris} triangles`);
  for (const m of ['Farm dog', 'Farm dog ear', 'Farm dog light', 'Farm collar']) assert.ok(mats.has(m), m);
  // Front (+z) legs ahead of the back legs, head ahead of the body.
  const at = (id: string) => kids.find((n: { name: string }) => n.name === id).translation;
  assert.ok(at('dog_leg_fl')[2] > at('dog_leg_bl')[2] && at('dog_head')[2] > at('dog_body')[2]);
});
