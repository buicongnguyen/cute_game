import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { World } from '../src/world.ts';
import { newGame, type SaveState } from '../src/model.ts';
import { EnvironmentSimulation, createEnvironmentLayout } from '../src/environments.ts';
import { HouseView } from '../src/house-view.ts';
import { FriendCrew } from '../src/friend-crew.ts';
import { disposeTree, keepAlive } from '../src/dispose-tree.ts';
import { friendsOf, giveGear, takeGear, type Friend } from '../src/friends.ts';

type Seeded = SaveState & { friends?: Friend[] };
const seeded = (): Seeded => {
  const s = newGame() as Seeded;
  s.friends = [{ id: 'sprout', role: 'garden', rescuedAt: 1, gear: {}, home: true }, { id: 'clover', role: 'farm', rescuedAt: 2, gear: {}, home: true }];
  Object.assign(s.bag, { hat_cowboy: 1 });
  return s;
};
function homeWorld(state: SaveState) {
  const w = Object.assign(Object.create(World.prototype), {
    state, scene: new T.Scene(), camera: new T.PerspectiveCamera(40, 1, .5, 300), root: new T.Group(), player: new T.Group(), companion: new T.Group(),
    position: new T.Vector3(0, 0, -4.4), destination: null, route: [], selected: null, obstacles: [], entities: [], enemies: [], plotMeshes: [], cropSignatures: [],
    particles: [], keys: new Set<string>(), facing: 0, time: 0, planet: 'home', hazardTimer: 0, zoom: 1, remoteRoot: new T.Group(),
    marker: new T.Mesh(), ring: new T.Mesh(), cameraTarget: new T.Vector3(), sun: new T.DirectionalLight(), raycaster: new T.Raycaster(),
    onInteract() {}, onAttackEnemy() {}, onDamage() {}, onZone() {}, resize() {},
  }) as World;
  w.environment = new EnvironmentSimulation(createEnvironmentLayout('home'));
  w.scene.add(w.root);
  return w;
}

/** Counts geometries created and disposed while `run` executes (a stand-in for renderer.info.memory.geometries). */
function liveGeometries(run: (size: () => number, track: (root: T.Object3D) => void) => void) {
  const created = new Set<T.BufferGeometry>(), origDispose = T.BufferGeometry.prototype.dispose;
  T.BufferGeometry.prototype.dispose = function (this: T.BufferGeometry) { created.delete(this); return origDispose.call(this); };
  const track = (root: T.Object3D) => root.traverse(o => { const m = o as T.Mesh; if (m.isMesh && !m.geometry.userData.sharedKit) created.add(m.geometry); });
  try { run(() => created.size, track); } finally { T.BufferGeometry.prototype.dispose = origDispose; }
}

test('disposeTree frees owned geometry and materials but keeps kit-shared and cached ones', () => {
  const shared = new T.BoxGeometry(); shared.userData.sharedKit = true;
  const cached = new T.MeshBasicMaterial(); keepAlive.add(cached);
  const own = new T.BoxGeometry(), ownMat = new T.MeshBasicMaterial(), g = new T.Group();
  g.add(new T.Mesh(shared, cached), new T.Mesh(own, ownMat));
  const freed: unknown[] = [];
  for (const r of [shared, cached, own, ownMat]) r.addEventListener('dispose', () => freed.push(r));
  disposeTree(g);
  assert.deepEqual(freed, [own, ownMat]);
});

test('house friends: repeated give/take does not grow live geometries', () => {
  const s = seeded(), view = new HouseView();
  const counts: number[] = [];
  liveGeometries((size, track) => {
    const sync = () => { view.syncFriends(friendsOf(s)); for (const v of view.friends.values()) track(v.group); };
    sync();
    for (let i = 0; i < 4; i++) { giveGear(s, 'sprout', 'hat_cowboy'); sync(); takeGear(s, 'sprout', 'hat'); sync(); counts.push(size()); }
  });
  assert.ok(counts.every(c => c === counts[0]), `stable: ${counts}`);
});

test('friend crew: repeated give/take and leaving friends free their models', () => {
  const s = seeded(), w = homeWorld(s);
  const crew = new FriendCrew({ world: w, own: () => s, visiting: () => false, flying: () => false, started: () => false, robotBed: () => undefined, animalAt: () => undefined,
    perform: async () => undefined, rescued() {}, locked() {}, worked() {}, arrived() {} });
  const counts: number[] = [];
  liveGeometries((size, track) => {
    const tick = () => { crew.update(.016); track(crew.group); };
    tick();
    for (let i = 0; i < 4; i++) { giveGear(s, 'sprout', 'hat_cowboy'); tick(); takeGear(s, 'sprout', 'hat'); tick(); counts.push(size()); }
    s.friends = []; tick(); counts.push(size());
  });
  assert.ok(counts.slice(0, 4).every(c => c === counts[0]), `stable: ${counts}`);
  assert.equal(counts[4], 0, 'all friend geometry freed once they leave');
});

test('disposeTree frees the drawn ground texture of an owned material but not kit-shared or image textures', () => {
  const canvas = { width: 2, height: 2 } as unknown as HTMLCanvasElement;
  const ground = new T.CanvasTexture(canvas), kit = new T.CanvasTexture(canvas), image = new T.Texture();
  kit.userData.sharedKit = true;
  const g = new T.Group();
  g.add(new T.Mesh(new T.PlaneGeometry(), new T.MeshBasicMaterial({ map: ground })));
  g.add(new T.Mesh(new T.PlaneGeometry(), new T.MeshBasicMaterial({ map: kit })));
  g.add(new T.Mesh(new T.PlaneGeometry(), new T.MeshBasicMaterial({ map: image })));
  const freed: unknown[] = [];
  for (const tex of [ground, kit, image]) tex.addEventListener('dispose', () => freed.push(tex));
  disposeTree(g);
  assert.deepEqual(freed, [ground]);
});
