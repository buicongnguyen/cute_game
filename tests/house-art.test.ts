import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { World } from '../src/world.ts';
import { newGame } from '../src/model.ts';
import { EnvironmentSimulation, createEnvironmentLayout } from '../src/environments.ts';
import { HouseSession } from '../src/house-session.ts';
import { RefinedAssetLibrary } from '../src/assets.ts';

// User report: "going in and out of the house, sometimes the outside turns into very simple drawings".
// A game resumed indoors (or a model landing while inside) applied the building models to the interior's
// entity list, so the real cottage, stalls and chest never got theirs and stood as stand-ins after leaving.
function homeWorld() {
  const w = Object.assign(Object.create(World.prototype), {
    state: newGame(), scene: new T.Scene(), camera: new T.PerspectiveCamera(40, 1, .5, 300), root: new T.Group(), player: new T.Group(), companion: new T.Group(),
    position: new T.Vector3(0, 0, -4.4), destination: null, route: [], selected: null, obstacles: [], entities: [], enemies: [], plotMeshes: [], cropSignatures: [],
    particles: [], keys: new Set<string>(), facing: 0, time: 0, planet: 'home', hazardTimer: 0, zoom: 1, remoteRoot: new T.Group(),
    marker: new T.Mesh(), ring: new T.Mesh(), cameraTarget: new T.Vector3(), sun: new T.DirectionalLight(), raycaster: new T.Raycaster(),
    onInteract() {}, onAttackEnemy() {}, onDamage() {}, onZone() {}, resize() {},
  }) as World;
  w.environment = new EnvironmentSimulation(createEnvironmentLayout('home'));
  w.root.add(w.player, w.companion); w.scene.add(w.root, w.marker, w.ring, w.remoteRoot);
  for (const [kind, x] of [['home', 0], ['shop', 6], ['chest', -4]] as const) {
    const e = { id: `home:${kind}:0`, kind, name: kind, icon: '', mesh: new T.Group(), x, z: -8, radius: 2 }; w.root.add(e.mesh); w.entities.push(e);
  }
  return w;
}
const models = async () => { await Promise.resolve(); const g = new T.Group(); g.add(new T.Mesh(new T.BoxGeometry(), new T.MeshStandardMaterial())); return g; };

test('building models that arrive while the explorer is indoors dress the outdoor buildings', async () => {
  const w = homeWorld(), house = new HouseSession(), outdoor = w.entities, assets = new RefinedAssetLibrary(models);
  house.enter(w);
  assert.notEqual(w.entities, outdoor);
  await assets.loadAll(); w.applyRefinedAssets(assets);
  assert.deepEqual(w.entities.filter(e => e.mesh.userData.refinedAsset).map(e => e.kind), [], 'the interior list is untouched');
  house.leave();
  assert.equal(w.entities, outdoor);
  assert.deepEqual(outdoor.map(e => e.mesh.userData.refinedAsset), ['cottage', 'outfitters', 'chest']);
});

test('many trips in and out keep the outdoor models', async () => {
  const w = homeWorld(), house = new HouseSession(), assets = new RefinedAssetLibrary(models);
  await assets.loadAll(); w.applyRefinedAssets(assets);
  const meshes = w.entities.map(e => e.mesh.children.length);
  for (let i = 0; i < 6; i++) { house.enter(w); w.applyRefinedAssets(assets); house.leave(); w.applyRefinedAssets(assets); }
  assert.deepEqual(w.entities.map(e => e.mesh.userData.refinedAsset), ['cottage', 'outfitters', 'chest']);
  assert.deepEqual(w.entities.map(e => e.mesh.children.length), meshes);
});
