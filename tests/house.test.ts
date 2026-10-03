import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { World } from '../src/world.ts';
import { newGame, type SaveState } from '../src/model.ts';
import { applyGameAction } from '../src/actions.ts';
import { EnvironmentSimulation, createEnvironmentLayout } from '../src/environments.ts';
import { findRoute, clearSegment, WORLD_BOUNDS } from '../src/navigation.ts';
import { FURNITURE, FRIEND_SPOTS, HOUSE, INDOOR_Y, ROOMS, WALLS, furnitureObstacles, roomAt, walkable } from '../src/house.ts';
import { HouseSession, houseFocus } from '../src/house-session.ts';
import { HouseView, houseKit } from '../src/house-view.ts';
import { friendsOf, giveGear, takeGear, type Friend } from '../src/friends.ts';
import { dressHtml, wearables } from '../src/house-ui.ts';
import { ACTIVITIES } from '../src/house-activities.ts';

type Seeded = SaveState & { friends?: Friend[] };
const seeded = (): Seeded => {
  const s = newGame() as Seeded;
  s.friends = [{ id: 'sprout', role: 'garden', rescuedAt: 1, gear: { hat: 'hat_straw' }, home: true }, { id: 'clover', role: 'farm', rescuedAt: 2, gear: {}, home: true }, { id: 'pepper', role: 'cook', rescuedAt: 3, gear: { pet: 'pet_parrot' }, home: true }];
  Object.assign(s.bag, { hat_cowboy: 1, armor_cloud: 2, sword_wood: 1, dz_ninja: 1 });
  return s;
};
// The real World without WebGL (as world.test.ts / creature-ai.test.ts build it).
function homeWorld(state: SaveState = seeded()) {
  const w = Object.assign(Object.create(World.prototype), {
    state, scene: new T.Scene(), camera: new T.PerspectiveCamera(40, 1, .5, 300), root: new T.Group(), player: new T.Group(), companion: new T.Group(),
    position: new T.Vector3(0, 0, -4.4), destination: null, route: [], selected: null, obstacles: [{ x: 0, z: -8, r: 2.7 }], entities: [], enemies: [], plotMeshes: [], cropSignatures: [],
    particles: [], keys: new Set<string>(), facing: 0, time: 0, planet: 'home', hazardTimer: 0, zoom: 1, remoteRoot: new T.Group(),
    marker: new T.Mesh(), ring: new T.Mesh(), cameraTarget: new T.Vector3(), sun: new T.DirectionalLight(), raycaster: new T.Raycaster(),
    onInteract() {}, onAttackEnemy() {}, onDamage() {}, onZone() {}, resize() {},
  }) as World;
  w.environment = new EnvironmentSimulation(createEnvironmentLayout('home'));
  w.root.add(w.player, w.companion); w.scene.add(w.root, w.marker, w.ring, w.remoteRoot);
  const home = { id: 'home:home:0', kind: 'home', name: 'Your cottage', icon: '🏡', mesh: new T.Group(), x: 0, z: -8, radius: 3.2 };
  w.root.add(home.mesh); w.entities.push(home);
  return w;
}
const centre = (r: { x0: number; x1: number; z0: number; z1: number }) => ({ x: (r.x0 + r.x1) / 2, z: (r.z0 + r.z1) / 2 });

test('the plan: one big room and five small ones, all reachable from the front door through doorways around the furniture', () => {
  const big = ROOMS.find(r => r.id === 'living')!, area = (r: typeof big) => (r.rect.x1 - r.rect.x0) * (r.rect.z1 - r.rect.z0);
  assert.equal(ROOMS.length, 6);
  for (const room of ROOMS) if (room !== big) assert.ok(area(room) < area(big) * .6, room.id);
  assert.ok(walkable(HOUSE.spawn));
  const obstacles = furnitureObstacles(), options = { bounds: WORLD_BOUNDS, clearance: .36, gridSize: .5, walkable };
  // Points in each room clear of furniture: the explorer can walk to every one of them from the door.
  const goals: Record<string, { x: number; z: number }> = { living: { x: 0, z: 2.5 }, kitchen: { x: -7.5, z: 1.2 }, craft: { x: 7.2, z: 1.8 }, bedroom: { x: -5.2, z: -3.4 }, bath: { x: .5, z: -3.4 }, study: { x: 6.5, z: -3.6 } };
  for (const [id, goal] of Object.entries(goals)) {
    assert.equal(roomAt(goal)?.id, id);
    const route = findRoute(HOUSE.spawn, goal, obstacles, options);
    assert.ok(route.length > 0, `no way into the ${id}`);
    let from = HOUSE.spawn; for (const p of route) { assert.ok(clearSegment(from, p, obstacles, options), id); from = p; }
  }
  // Furniture stays inside its room and off the doorways.
  for (const p of FURNITURE) if (p.block) assert.ok(roomAt(p), p.kit);
  for (const spot of FRIEND_SPOTS) assert.equal(roomAt(spot)?.id, 'living');
});

test('walls keep the explorer inside: walking into every wall and out of the front stops at the wall', () => {
  const w = homeWorld(), house = new HouseSession();
  house.enter(w);
  const b = HOUSE.bounds;
  for (const [dx, dz, start] of [[1, 0, { x: 3, z: 3 }], [-1, 0, { x: -7, z: 3 }], [0, 1, { x: -2, z: 3 }], [0, -1, { x: 0, z: -3 }], [0, 1, { x: 7, z: -3 }], [1, 0, { x: 8, z: -4 }]] as const) {
    w.position.set(start.x, 0, start.z);
    for (let i = 0; i < 200; i++) w.move(dx * .1, dz * .1);
    const p = w.position;
    assert.ok(walkable(p), `left the plan at ${p.x.toFixed(2)}, ${p.z.toFixed(2)}`);
    assert.ok(p.x > b.x0 && p.x < b.x1 && p.z > b.z0 && p.z < b.z1);
  }
  // Interior walls between rooms hold too (kitchen | living away from its doorway).
  w.position.set(-3, 0, 0); for (let i = 0; i < 100; i++) w.move(-.1, 0);
  assert.ok(w.position.x > -5 + .1, 'went through the kitchen wall');
});

test('entering swaps in the interior and leaving restores the village, in front of the door', () => {
  const w = homeWorld(), house = new HouseSession(), outdoor = w.entities, obstacles = w.obstacles;
  house.enter(w);
  assert.ok(w.interior && house.inside);
  assert.equal(w.player.parent, house.view.root);
  assert.equal(w.marker.parent, house.view.scene);
  assert.deepEqual([w.position.x, w.position.z], [HOUSE.spawn.x, HOUSE.spawn.z]);
  assert.ok(w.zoom < 1);
  const kinds = w.entities.map(e => e.kind).sort();
  // The door, three friends and every activity (house-activities.ts; stove, workbench and globe use main.ts's own kinds).
  assert.deepEqual(kinds, ['friend', 'friend', 'friend', 'house-door', ...ACTIVITIES.map(a => a.entity)].sort());
  assert.ok(!w.entities.includes(outdoor[0]), 'no outdoor things are tappable inside');
  // Creatures stay outdoors: nothing hostile in the interior's entities or scene.
  assert.ok(w.entities.every(e => e.kind !== 'enemy'));
  // The world draws the interior scene while inside.
  let drawn: T.Scene | null = null; (w as unknown as { renderer: unknown }).renderer = { render: (scene: T.Scene) => { drawn = scene; } }; w.render();
  assert.equal(drawn, house.view.scene);
  // Re-dressing the explorer inside keeps it inside.
  w.player.removeFromParent(); w.root.add(w.player); w.interior!.adopt(); assert.equal(w.player.parent, house.view.root);
  house.leave();
  assert.ok(!w.interior && !house.inside);
  assert.equal(w.entities, outdoor); assert.equal(w.obstacles, obstacles);
  assert.equal(w.player.parent, w.root); assert.equal(w.marker.parent, w.scene);
  assert.equal(w.zoom, 1);
  assert.ok(Math.hypot(w.position.x - HOUSE.outside.x, w.position.z - HOUSE.outside.z) < 1e-9);
  assert.ok(!w.blocked(w.position.x, w.position.z), 'stands clear of the cottage');
  w.render(); assert.equal(drawn, w.scene);
});

test('a world rebuild while inside drops the interior (travel, visiting, reset)', () => {
  const w = homeWorld(), house = new HouseSession(), outdoor = w.entities;
  house.enter(w);
  const inside = w.interior!; w.interior = null; inside.drop();
  assert.ok(!house.inside); assert.equal(w.entities, outdoor); assert.equal(w.player.parent, w.root); assert.equal(w.zoom, 1);
});

test('other explorers show only on their side of the door (pose height tags the inside)', () => {
  const w = homeWorld(), house = new HouseSession();
  (w as unknown as { avatar: () => T.Group }).avatar = () => new T.Group();
  w.updateRemotePlayer('out', { x: 1, z: 1, y: 0, planet: 'home' });
  w.updateRemotePlayer('in', { x: 1, z: 1, y: INDOOR_Y, planet: 'home' });
  const mesh = (id: string) => w.remotePlayers.get(id)!.mesh;
  assert.equal(mesh('out').visible, true); assert.equal(mesh('in').visible, false);
  house.enter(w);
  w.updateRemotePlayer('out', { x: 1, z: 1, y: 0 }); w.updateRemotePlayer('in', { x: 1, z: 1, y: INDOOR_Y });
  assert.equal(mesh('out').visible, false); assert.equal(mesh('in').visible, true); assert.equal(mesh('in').position.y, 0);
});

test('give and take round-trip with the bag; the stub and the action agree', () => {
  const s = seeded();
  assert.ok(giveGear(s, 'clover', 'hat_cowboy'));
  assert.equal(s.bag.hat_cowboy, undefined); assert.equal(friendsOf(s)[1].gear.hat, 'hat_cowboy');
  // Giving another hat returns the old one.
  s.bag.hat_bear = 1; assert.ok(giveGear(s, 'clover', 'hat_bear')); assert.equal(s.bag.hat_cowboy, 1); assert.equal(friendsOf(s)[1].gear.hat, 'hat_bear');
  assert.ok(takeGear(s, 'clover', 'hat')); assert.equal(s.bag.hat_bear, 1); assert.equal(friendsOf(s)[1].gear.hat, undefined);
  assert.equal(giveGear(s, 'clover', 'dz_ninja'), false, 'disguises are not for friends');
  assert.equal(giveGear(s, 'clover', 'hat_wizard'), false, 'only what is in the bag');
  // Outfits go in the outfit slot (as SaveState.gear); the explorer stops wearing something it gave away.
  s.gear.outfit = 'armor_cloud'; s.bag.armor_cloud = 1; assert.ok(giveGear(s, 'sprout', 'armor_cloud'));
  assert.equal(friendsOf(s)[0].gear.outfit, 'armor_cloud'); assert.equal(s.gear.outfit, undefined);
  // Through the shared action reducer (offline and online use it).
  const t = seeded();
  applyGameAction(t, { type: 'giveFriendGear', payload: { friend: 'pepper', id: 'sword_wood' } });
  assert.equal(friendsOf(t)[2].gear.weapon, 'sword_wood'); assert.equal(t.bag.sword_wood, undefined);
  applyGameAction(t, { type: 'takeFriendGear', payload: { friend: 'pepper', slot: 'weapon' } });
  assert.equal(t.bag.sword_wood, 1); assert.equal(friendsOf(t)[2].gear.weapon, undefined);
  assert.throws(() => applyGameAction(t, { type: 'takeFriendGear', payload: { friend: 'pepper', slot: 'weapon' } }));
});

test('the dress panel lists worn gear per slot and the wearables in the bag; visitors only look', () => {
  const s = seeded(), html = dressHtml(s, 'sprout');
  assert.match(html, /data-house-action="take"[^>]*data-slot="hat"/);
  for (const { id } of wearables(s)) assert.match(html, new RegExp(`data-item="${id}"`));
  assert.ok(!html.includes('dz_ninja'));
  const visitor = dressHtml(s, 'sprout', { readOnly: true });
  assert.ok(!visitor.includes('data-house-action="give"')); assert.match(visitor, /disabled/);
});

test('friends sit in the big room wearing what they were given, and change at once', () => {
  const s = seeded(), view = new HouseView();
  view.syncFriends(friendsOf(s));
  const gearOn = (id: string) => { const items: string[] = []; view.friends.get(id as 'sprout')!.group.traverse(o => { if (o.userData.gear) items.push(o.userData.gear); }); return items; };
  assert.deepEqual(gearOn('sprout'), ['hat_straw']); assert.deepEqual(gearOn('pepper'), ['pet_parrot']);
  const before = view.friends.get('sprout')!.group;
  giveGear(s, 'sprout', 'hat_cowboy'); view.syncFriends(friendsOf(s));
  assert.notEqual(view.friends.get('sprout')!.group, before); assert.deepEqual(gearOn('sprout'), ['hat_cowboy']);
  assert.equal(before.parent, null, 'the old look is gone');
  // Friends keep a schedule around the house (house-activities.ts HANGOUTS): each stands in some room.
  for (const v of view.friends.values()) { assert.equal(v.group.parent, view.root); assert.ok(roomAt(v.group.position)); }
  // Half the explorer's size.
  assert.ok(Math.abs(view.friends.get('clover')!.group.scale.x - .42) < 1e-9);
});

test('draw budget: the whole interior from the Blender kit is two batches (plus the door)', async () => {
  const bytes = await readFile(new URL('../public/assets/models/house.glb', import.meta.url));
  assert.ok(bytes.length < 580_000); // 544 KB + the upgrade bench (~19 KB)
  const gltf = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer, '');
  // Earlier tests asked for the kit without a server; load it again from the file.
  Object.assign(houseKit, { loadScene: async () => gltf.scene, loading: null });
  await houseKit.load(); assert.equal(houseKit.ready, true);
  for (const p of FURNITURE) assert.ok(houseKit.has(p.kit), p.kit);
  const view = new HouseView();
  assert.equal(view.staticDraws, 2);
  let meshes = 0, triangles = 0, casters = 0;
  view.root.traverse(o => { if (o instanceof T.Mesh) { meshes++; triangles += o.geometry.getAttribute('position').count / 3; if (o.castShadow) casters++; } });
  // Two batches, the door, and the live flame, puffs (one instanced draw) and highlight ring; plus the hover ring and glow,
  // which are hidden (no draw) until a mouse is over something.
  assert.ok(meshes <= 8, `${meshes} meshes`); assert.ok(casters <= 2);
  assert.ok(triangles < 60_000, `${triangles} triangles`);
  // Glow (lamps, flames, window light) is unlit and separate; everything else is one vertex-coloured toon mesh.
  const shell = view.root.getObjectByName('house-shell') as T.Mesh, glow = view.root.getObjectByName('house-glow') as T.Mesh;
  assert.ok(shell.geometry.getAttribute('color') && glow.geometry.getAttribute('color'));
  assert.ok(glow.material instanceof T.MeshBasicMaterial);
  // Friends never join the shadow pass.
  view.syncFriends(friendsOf(seeded())); let friendCasters = 0;
  for (const f of view.friends.values()) f.group.traverse(o => { if (o instanceof T.Mesh && o.castShadow) friendCasters++; });
  assert.equal(friendCasters, 0);
});

test('the camera frames the house: it follows the explorer but never wanders far past the walls', () => {
  for (const aspect of [390 / 844, 844 / 390, 1440 / 900]) {
    const zoom = aspect > 1 ? HOUSE.wideZoom : HOUSE.zoom;
    for (const room of ROOMS) {
      const f = houseFocus(centre(room.rect), aspect, zoom);
      assert.ok(f.x >= HOUSE.bounds.x0 && f.x <= HOUSE.bounds.x1 && f.z >= HOUSE.bounds.z0 - 1 && f.z <= HOUSE.bounds.z1, `${room.id} @ ${aspect.toFixed(2)}`);
    }
  }
  assert.ok(WALLS.some(w => w.height < 1), 'walls toward the camera are cut low');
});
