import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import * as T from 'three';
import * as M from '../src/model.ts';
import { World } from '../src/world.ts';
import { HouseSession } from '../src/house-session.ts';
import { INDOOR_Y } from '../src/house.ts';
import { PEN } from '../src/farm.ts';
import { CombatSimulation } from '../src/combat.ts';
import { PetCompanion } from '../src/pet-world.ts';
import { FLYING_PETS, PERCH_FEET, PET_FAR, PET_FLY, PET_HOVER, newPetLink, penSpots, petFollows, petMayFight, petStyle, petTrail, restY, stepPet } from '../src/pet-pen.ts';
import { createAccountStore } from '../server/account-store.mjs';
import { createCombatAuthority } from '../server/combat-authority.mjs';
import { enemyRoster } from '../src/enemy-roster.ts';

const PETS = Object.keys(M.ITEMS).filter(id => M.ITEMS[id].slot === 'pet');
const dt = 1 / 60;

test('every pet has a pen style: the parrot and dragon perch, other flyers hover, the rest walk', () => {
  assert.ok(PETS.length >= 16);
  for (const id of PETS) assert.equal(petStyle(id), id === 'pet_parrot' || id === 'pet_dragon' ? 'perch' : FLYING_PETS.includes(id) ? 'hover' : 'walk', id);
  assert.ok(FLYING_PETS.every(id => PETS.includes(id)));
});

test('it follows only away from the safe village: wilds and other planets yes, the village, the cottage and the wire\'s indoor pose no', () => {
  assert.equal(petFollows('home', { x: 0, z: 0 }), false); assert.equal(petFollows('home', { x: 12, z: -9 }), false);
  assert.equal(petFollows('home', { x: 40, z: 0 }), true); assert.equal(petFollows('home', { x: 40, z: 0 }, true), false);
  assert.equal(petFollows('home', { x: 40, z: 0, y: INDOOR_Y }), false); assert.equal(petFollows('candy', { x: 0, z: 0 }), true);
});

test('fighting gate: never from the pen or on the way back, only while it follows away from home', () => {
  for (const place of ['pen', 'return'] as const) for (const pose of [{ x: 0, z: 0 }, { x: 40, z: 0 }]) assert.equal(petMayFight(place, 'home', pose), false);
  assert.equal(petMayFight('follow', 'home', { x: 40, z: 0 }), true); assert.equal(petMayFight('follow', 'jungle', { x: 0, z: 0 }), true);
  assert.equal(petMayFight('follow', 'home', { x: 3, z: 3 }), false, 'a stale follow inside the village still does not shoot');
  assert.equal(petMayFight('follow', 'home', { x: 40, z: 0 }, true), false, 'indoors');
});

test('pen spots: perches on the fence posts, coop roof and hay bale; ground spots without a built pen or for walkers; shelters kept clear', () => {
  const perch = penSpots('perch', PEN), walk = penSpots('walk', PEN), bare = penSpots('perch', PEN, false);
  assert.ok(perch.length >= 4 && perch.every(s => s.y > .4), 'up on things'); assert.ok(walk.every(s => s.y === 0)); assert.deepEqual(bare, walk);
  for (const s of [...perch, ...walk]) assert.ok(Math.hypot(s.x - PEN.x, s.z - PEN.z) < 5, 'around the pen');
  const shelter = { x: perch[0].x, z: perch[0].z + .2 }; assert.ok(!penSpots('perch', PEN, true, [shelter]).some(s => Math.hypot(s.x - shelter.x, s.z - shelter.z) < .9));
  assert.equal(restY('perch', perch[0], PERCH_FEET.pet_parrot), perch[0].y - PERCH_FEET.pet_parrot, 'feet on the perch');
  assert.ok(restY('hover', { x: 0, y: 0, z: 0 }) >= .9);
});

test('pen -> follow -> return -> pen: waits and hops at the pen, flies out smoothly, trails, flies home and lands on a perch', () => {
  const spots = penSpots('perch', PEN), p = newPetLink(), feet = PERCH_FEET.pet_parrot, player = { x: -5, z: 2 };
  p.x = spots[0].x; p.z = spots[0].z; p.y = restY('perch', spots[0], feet);
  // In the village it stays at the pen whatever the explorer does, resting or moving between perches.
  const seen = new Set<number>();
  for (let i = 0; i < 60 * 40; i++) { player.x = -5 + Math.sin(i / 50) * 8; assert.equal(stepPet(p, dt, false, player, 0, 0, spots, 'perch', feet), 'pen'); seen.add(p.spot); assert.ok(Math.hypot(p.x - PEN.x, p.z - PEN.z) < 5); }
  assert.ok(seen.size >= 3, 'it moves between several perches'); assert.ok(p.hop || p.resting);
  // Leaving the village: it sets off from the pen (no jump to the explorer) and catches up without teleporting.
  const start = { x: p.x, z: p.z }; player.x = 0; player.z = 22;
  assert.equal(stepPet(p, dt, true, player, 0, 0, spots, 'perch', feet), 'follow'); assert.ok(Math.hypot(p.x - start.x, p.z - start.z) < PET_FLY * dt + 1e-6);
  let maxStep = 0;
  for (let i = 0; i < 60 * 6; i++) { player.z += 3 * dt; const bx = p.x, bz = p.z; stepPet(p, dt, true, player, 0, 0, spots, 'perch', feet); maxStep = Math.max(maxStep, Math.hypot(p.x - bx, p.z - bz)); }
  const trail = petTrail(player, 0); assert.ok(Math.hypot(p.x - trail.x, p.z - trail.z) < 1, 'beside the explorer'); assert.ok(maxStep <= PET_FLY * dt + 1e-6, 'never jumps');
  assert.ok(Math.abs(p.y - PET_HOVER) < .05, 'hovers at the old companion height');
  // Back inside: it flies home to the nearest perch and the pen takes it over there.
  player.z = 5; assert.equal(stepPet(p, dt, false, player, 0, 0, spots, 'perch', feet), 'return');
  let place = 'return'; for (let i = 0; i < 60 * 12 && place !== 'pen'; i++) place = stepPet(p, dt, false, player, 0, 0, spots, 'perch', feet);
  assert.equal(place, 'pen'); assert.ok(spots.some(s => Math.hypot(s.x - p.x, s.z - p.z) < .2));
});

test('far away (a respawn, a long ride) it is placed, never stuck: beside the explorer out there, at the pen at home', () => {
  const spots = penSpots('walk', PEN), p = newPetLink(), player = { x: 200, z: 200 };
  stepPet(p, dt, true, player, 0, 0, spots, 'walk'); stepPet(p, dt, true, player, 0, 0, spots, 'walk');
  const t = petTrail(player, 0); assert.ok(Math.hypot(p.x - t.x, p.z - t.z) < .01, `beyond ${PET_FAR} m it is placed beside you`);
  stepPet(p, dt, false, { x: 0, z: 0 }, 0, 0, spots, 'walk'); assert.equal(stepPet(p, dt, false, { x: 0, z: 0 }, 0, 0, spots, 'walk'), 'pen');
  assert.ok(spots.some(s => Math.hypot(s.x - p.x, s.z - p.z) < .01));
  const away = newPetLink(); assert.equal(stepPet(away, dt, true, { x: 5, z: 5 }, 0, 0, [], 'hover'), 'follow', 'another planet: it appears beside you');
  assert.ok(Math.hypot(away.x - 5, away.z - 5) < 2.5);
});

/** A minimal host for the companion controller (world.ts passes itself). */
function host(pet = 'pet_parrot') {
  const s = M.newGame(); s.bag[pet] = 1; s.gear.pet = pet; s.farm.built = true;
  const companion = new T.Group(); companion.userData.wings = [{ node: new T.Object3D(), base: .2, side: 1 }];
  return { companion, planet: 'home', position: new T.Vector3(-4, 0, 3), facing: 0, boarded: false, time: 0, state: s, farmView: { isBuilt: true }, interior: undefined as unknown, petStaysHome: () => false };
}
test('the companion controller: at the pen at home, out with you in the wilds, at your own pen while you visit a friend', () => {
  const h = host(), c = new PetCompanion();
  for (let i = 0; i < 120; i++) { h.time += dt; c.update(h, dt); }
  assert.equal(c.place, 'pen'); assert.equal(c.shown, true); assert.ok(Math.hypot(h.companion.position.x - PEN.x, h.companion.position.z - PEN.z) < 5);
  assert.equal(c.mayFight(h.planet, h.position), false, 'no fighting from the pen');
  // Perched: wings folded (at their rest angle, apart from a rare ruffle).
  if (c.link.resting) assert.ok(Math.abs((h.companion.userData.wings[0].node as T.Object3D).rotation.z - .2) <= .36);
  h.position.set(0, 0, 30);
  for (let i = 0; i < 60 * 5; i++) { h.time += dt; c.update(h, dt); }
  assert.equal(c.place, 'follow'); assert.ok(h.companion.position.distanceTo(new T.Vector3(h.position.x, h.companion.position.y, h.position.z)) < 2.2);
  assert.equal(c.mayFight(h.planet, h.position), true);
  // Indoors counts as home: it goes back to the pen and does not fight.
  h.interior = {}; h.position.set(0, 0, 0); c.update(h, dt); assert.equal(c.mayFight(h.planet, h.position, true), false); assert.notEqual(c.place, 'follow'); h.interior = undefined;
  h.petStaysHome = () => true; c.update(h, dt); assert.equal(c.shown, false); assert.equal(c.mayFight(h.planet, h.position), false);
  // Landing on another planet: beside you at once.
  h.petStaysHome = () => false; h.planet = 'candy'; h.position.set(50, 0, 50); c.update(h, dt);
  assert.equal(c.place, 'follow'); assert.ok(Math.hypot(h.companion.position.x - 50, h.companion.position.z - 50) < 2.5);
  // Walkers stay on the ground at the pen.
  const w = host('pet_sheep'), wc = new PetCompanion(); for (let i = 0; i < 60; i++) { w.time += dt; wc.update(w, dt); }
  assert.equal(wc.place, 'pen'); assert.ok(w.companion.position.y < .25);
});

function world(pet = 'pet_parrot') {
  const s = M.newGame(); s.bag[pet] = 1; s.gear.pet = pet; s.farm.built = true;
  const w = Object.assign(Object.create(World.prototype), {
    state: s, scene: new T.Scene(), camera: new T.PerspectiveCamera(40, 4 / 3, .5, 300), root: new T.Group(), player: new T.Group(), companion: new T.Group(), position: new T.Vector3(),
    destination: null, route: [], selected: null, obstacles: [], entities: [], enemies: [], plotMeshes: [], cropSignatures: [], particles: [], keys: new Set<string>(), facing: 0, time: 0, planet: 'home', hazardTimer: 0,
    marker: new T.Mesh(), ring: new T.Mesh(), cameraTarget: new T.Vector3(), sun: new T.DirectionalLight(), raycaster: new T.Raycaster(), remoteRoot: new T.Group(),
    onInteract() {}, onAttackEnemy() {}, onDamage() {}, onZone() {}, resize() {},
  }) as World;
  return w;
}
test('in the real world update the parrot waits at the pen in the village and joins the explorer outside it', () => {
  const w = world(); w.build('home'); w.refreshPlayer(); w.position.set(-3, 0, 4);
  for (let i = 0; i < 90; i++) w.update(dt, true, false);
  assert.equal(w.petPen!.place, 'pen'); assert.ok(Math.hypot(w.companion.position.x - PEN.x, w.companion.position.z - PEN.z) < 5); assert.equal(w.companion.visible, true);
  w.position.set(2, 0, 30); for (let i = 0; i < 60 * 4; i++) w.update(dt, true, false);
  assert.equal(w.petPen!.place, 'follow'); assert.ok(Math.hypot(w.companion.position.x - w.position.x, w.companion.position.z - w.position.z) < 2.5);
  w.petStaysHome = () => true; w.update(dt, true, false); assert.equal(w.companion.visible, false, 'visiting: your pet is at your own pen');
});

test('other explorers see your pet beside you only outside the safe village (the same rule as your own view)', () => {
  const w = world(); w.addRemotePlayer('ann', { x: 2, z: 3, planet: 'home', gear: { pet: 'pet_parrot' } });
  const pet = () => w.remotePlayers.get('ann')!.mesh.getObjectByName('remote-pet')!;
  (w as unknown as { animateRemotes(dt: number): void }).animateRemotes(dt); assert.equal(pet().visible, false, 'in the village: at their pen');
  w.updateRemotePlayer('ann', { x: 40, z: 3, planet: 'home' }); (w as unknown as { animateRemotes(dt: number): void }).animateRemotes(dt); assert.equal(pet().visible, true, 'in the wilds: with them');
  w.updateRemotePlayer('ann', { x: 1, z: 1, y: INDOOR_Y, planet: 'home' }); (w as unknown as { animateRemotes(dt: number): void }).animateRemotes(dt); assert.equal(pet().visible, false, 'indoors');
  w.updateRemotePlayer('ann', { x: 1, z: 1, y: 0, planet: 'candy' }); (w as unknown as { animateRemotes(dt: number): void }).animateRemotes(dt); assert.equal(pet().visible, true, 'another planet');
});

test('the cottage keeps the pet outdoors by the pen', () => {
  const w = world(); w.root.add(w.player, w.companion); w.scene.add(w.root, w.marker, w.ring, w.remoteRoot);
  const house = new HouseSession(); house.enter(w as never);
  assert.equal(w.player.parent, house.view.root); assert.equal(w.companion.parent, w.root);
  house.leave(); assert.equal(w.player.parent, w.root); assert.equal(w.companion.parent, w.root);
});

test('the client combat host gives no pet shot while it waits at the pen', () => {
  // main.ts: pet() returns null unless world.petPen.mayFight(...); here the same gate drives a real simulation.
  const c = new PetCompanion(), h = host('pet_parrot'), target = { id: 'boar', x: -4, z: 6, hp: 500, radius: .8 }, hits: number[] = [];
  const sim = new CombatSimulation({ position: () => h.position, facing: () => 0, face() {}, targets: () => [target], weapon: () => ({ kind: 'fist', range: 1.6, cd: .5 }), stats: () => ({ attack: 50, critChance: 0 }), move() {}, hit(e, hit) { hits.push(hit.amount); e.hp -= hit.amount; return hit.amount; }, effect() {},
    pet: () => c.mayFight(h.planet, h.position) ? { dmg: .3, cd: 1.3, shot: 'arrow', x: h.companion.position.x, z: h.companion.position.z } : null }, () => .5);
  for (let i = 0; i < 180; i++) { c.update(h, dt); sim.update(dt); }
  assert.equal(hits.length, 0, 'at home: the parrot sits by the pen');
  h.position.set(0, 0, 30); target.x = 0; target.z = 33;
  for (let i = 0; i < 300; i++) { c.update(h, dt); sim.update(dt); }
  assert.ok(hits.length > 0, 'in the wilds: it shoots again');
});

test('the server gives no pet shot from the safe village and shoots again outside it', async t => {
  const dataDir = await mkdtemp(path.join(tmpdir(), 'cute-pet-pen-')), store = await createAccountStore({ dataDir, databaseUrl: '' }), profile = M.newGame(); profile.bag.pet_t_turtle = 1; profile.gear.pet = 'pet_t_turtle';
  const account = await store.create({ id: 'actor', username: 'actor', hash: 'h', salt: 's', profile, friends: [], requests: [], profileRevision: 0 });
  const peer = { account, active: true, visit: null, planet: 'home', room: 'public:home', pose: { x: -16, z: 0, facing: 0, moving: false }, socket: {} }, peers = new Map([['actor', peer]]);
  const room = { id: peer.room, members: new Set(['actor']), host: 'actor', enemies: [], killed: new Set() }, rooms = new Map([[room.id, room]]);
  const authority = createCombatAuthority({ store, peers, rooms, remember: (v: unknown) => v, onError: (e: Error) => t.diagnostic(e.stack ?? ''), send() {}, broadcast() {}, onDeath() {} });
  t.after(async () => { await authority.close(); await store.close(); });
  const definition = enemyRoster('home').find(e => e.type === 'mushroom')!;
  authority.acceptSnapshots(room, [{ id: definition.id, type: 'mushroom', x: -30, z: 0, hp: 1 }]); const enemy = authority.state(room).enemies.get(definition.id)!;
  enemy.x = -21; // just outside the village edge, 5 m from the explorer (new creatures are only accepted 22 m out)
  const engine = authority.engineFor(peer); for (let i = 0; i < 10; i++) engine.sim.update(.2);
  assert.ok(enemy, 'a creature just outside the village edge'); assert.equal(enemy.hp, enemy.maxHp, 'the explorer inside the safe village: the pet waits at the pen');
  peer.pose = { x: -25, z: 0, facing: 0, moving: false };
  for (let i = 0; i < 10; i++) engine.sim.update(.2);
  assert.ok(enemy.hp < enemy.maxHp, 'outside it: the pet fights');
});
