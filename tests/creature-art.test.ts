import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as T from 'three';
import { KitLibrary } from '../src/assets.ts';
import { CREATURE_PARTS, CREATURE_TRIANGLES, creatureArt, creatureKit } from '../src/creature-art.ts';
import { ENEMY_TYPES } from '../src/enemy-types.ts';
import { World } from '../src/world.ts';
import { newGame } from '../src/model.ts';
import { EnvironmentSimulation, createEnvironmentLayout } from '../src/environments.ts';

/** The JSON chunk of a GLB. */
function glb(path: string) {
  const data = readFileSync(path), length = data.readUInt32LE(12);
  return JSON.parse(data.subarray(20, 20 + length).toString('utf8')) as {
    nodes: { name?: string; children?: number[]; mesh?: number; translation?: number[] }[]; scenes: { nodes: number[] }[];
    meshes: { primitives: { indices: number }[] }[]; accessors: { count: number }[]; extensionsRequired?: string[];
  };
}

test('creatures.glb has every redrawn creature with the parts its animation needs, within its triangle budget', () => {
  const doc = glb(new URL('../public/assets/models/creatures.glb', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1'));
  const roots = new Map(doc.scenes[0].nodes.map(i => [doc.nodes[i].name, doc.nodes[i]]));
  // Quantised positions and normals: GLTFLoader reads them without a decoder.
  assert.ok(doc.extensionsRequired?.includes('KHR_mesh_quantization'));
  assert.ok(Object.keys(CREATURE_PARTS).length >= 12);
  for (const [id, parts] of Object.entries(CREATURE_PARTS)) {
    const def = ENEMY_TYPES[id], root = roots.get(id);
    assert.ok(def, `${id} is a creature type`);
    assert.ok(root, `${id} is in the kit`);
    const children = (root.children ?? []).map(i => doc.nodes[i]);
    assert.deepEqual(children.map(c => c.name).sort(), parts.map(p => `${id}_${p}`).sort(), `${id} parts`);
    let triangles = 0;
    for (const child of children) for (const p of doc.meshes[child.mesh!].primitives) triangles += doc.accessors[p.indices].count / 3;
    const budget = def.boss ? CREATURE_TRIANGLES.boss : CREATURE_TRIANGLES.common;
    assert.ok(triangles >= 300 && triangles <= budget, `${id}: ${triangles} triangles (budget ${budget})`);
    // Legs hang from hips above the ground, on their own side of the body.
    for (const child of children.filter(c => c.name!.includes('_leg_'))) {
      const [x, y] = child.translation ?? [0, 0, 0];
      assert.ok(y > .2, `${child.name} pivot is a hip`);
      assert.equal(Math.sign(x), child.name!.endsWith('l') ? -1 : 1, `${child.name} side`);
    }
  }
});

/** A stand-in kit scene: `<id>` roots with one mesh per `<id>_<part>` placed at its hinge. */
function fakeKit(models: Record<string, Record<string, [number, number, number]>>, extra: (scene: T.Group) => void = () => {}) {
  const scene = new T.Group();
  for (const [id, parts] of Object.entries(models)) {
    const root = new T.Group(); root.name = id;
    for (const [part, at] of Object.entries(parts)) {
      const mesh = new T.Mesh(new T.BoxGeometry(.2, .2, .2), new T.MeshStandardMaterial({ color: part === 'body' ? '#ff0000' : '#0000ff' }));
      mesh.name = `${id}_${part}`; mesh.position.set(...at); root.add(mesh);
    }
    scene.add(root);
  }
  extra(scene);
  return async () => scene;
}
const BOAR = { body: [0, .6, .1], leg_fl: [-.28, .62, -.4], leg_fr: [.28, .62, -.4], leg_bl: [-.28, .62, .55], leg_br: [.28, .62, .55] } as Record<string, [number, number, number]>;

test('a creature from the kit keeps each rigid part at its hinge under the names the walk and flap animation use', async () => {
  const kit = new KitLibrary(['creatures.glb'], fakeKit({ boar: BOAR }, scene => {
    // A second material on the body loads as `boar_body_1`: it joins the body, keeping its colour.
    const extra = new T.Mesh(new T.BoxGeometry(.1, .1, .1), new T.MeshStandardMaterial({ color: '#00ff00' }));
    extra.name = 'boar_body_1'; extra.position.set(0, .6, .1); scene.getObjectByName('boar')!.add(extra);
  }));
  await kit.load();
  const model = creatureArt('boar', kit)!;
  assert.ok(model);
  const meshes: T.Mesh[] = []; model.traverse(o => { if (o instanceof T.Mesh) meshes.push(o); });
  assert.equal(meshes.length, 5, 'one mesh per part, like the procedural boar');
  // Diagonal pairs share a phase: leg1 (front left) with leg2 (back right).
  for (const [name, part] of [['leg0', 'leg_bl'], ['leg1', 'leg_fl'], ['leg2', 'leg_br'], ['leg3', 'leg_fr']]) {
    const hinge = model.getObjectByName(name)!;
    assert.ok(hinge, name);
    assert.deepEqual(hinge.position.toArray().map(v => +v.toFixed(3)), BOAR[part], `${name} sits at the ${part} hinge`);
    // The leg mesh hangs from the hinge: turning the hinge swings the leg about the hip.
    const leg = hinge.children[0] as T.Mesh; leg.geometry.computeBoundingBox();
    assert.ok(Math.abs(leg.geometry.boundingBox!.getCenter(new T.Vector3()).y) < 1e-6);
  }
  const body = meshes.find(m => m.name === 'creature-body')!, colors = body.geometry.getAttribute('color');
  const seen = new Set<string>(); for (let i = 0; i < colors.count; i++) seen.add([colors.getX(i), colors.getY(i), colors.getZ(i)].map(v => v.toFixed(2)).join());
  assert.equal(seen.size, 2, 'both body materials survive as baked vertex colours');
  assert.ok((body.material as T.Material & { vertexColors: boolean }).vertexColors);
  // Instances share the kit's geometry and material (cheap to spawn, never disposed by the world).
  const again = creatureArt('boar', kit)!, body2 = again.getObjectByName('creature-body') as T.Mesh;
  assert.equal(body2.geometry, body.geometry);
  assert.equal(body2.geometry.userData.sharedKit, true);
});

test('creatures keep their procedural shapes while the kit is missing, unloaded or lacks a part', async () => {
  const missing = new KitLibrary(['creatures.glb'], async () => { throw new Error('offline'); });
  assert.equal(creatureArt('boar', missing), null, 'not loaded yet');
  await missing.load();
  assert.equal(creatureArt('boar', missing), null, 'file missing');
  const { leg_br: _, ...threeLegs } = BOAR;
  const partial = new KitLibrary(['creatures.glb'], fakeKit({ boar: threeLegs, mushroom: { body: [0, 0, 0] } }));
  await partial.load();
  assert.equal(creatureArt('boar', partial), null, 'a creature never loses a leg');
  assert.ok(creatureArt('mushroom', partial));
  assert.equal(creatureArt('dragon', partial), null, 'creatures without art');
});

function world() {
  const w = Object.assign(Object.create(World.prototype), {
    state: newGame(), scene: new T.Scene(), camera: new T.OrthographicCamera(-3, 3, 3, -3, .1, 20),
    root: new T.Group(), player: new T.Group(), companion: new T.Group(), position: new T.Vector3(),
    destination: null, route: [], selected: null, obstacles: [], entities: [], enemies: [], plotMeshes: [], cropSignatures: [],
    particles: [], keys: new Set<string>(), facing: 0, time: 0, planet: 'home', hazardTimer: 0,
    marker: new T.Mesh(), ring: new T.Mesh(), cameraTarget: new T.Vector3(), sun: new T.DirectionalLight(), raycaster: new T.Raycaster(),
    onInteract() {}, onAttackEnemy() {}, onDamage() {}, onZone() {},
  }) as World;
  w.environment = new EnvironmentSimulation(createEnvironmentLayout('home'));
  return w;
}

test('creatures that spawned before the kit arrived are re-dressed in place, keeping their entity, pose and scale', async () => {
  const w = world(), boar = w.spawnSpecies('boar', 40, 0, 0)!, wolf = w.spawnSpecies('wolf', 44, 0, 1)!;
  const root = boar.mesh, scale = root.scale.x;
  assert.equal(root.userData.creatureArt, false, 'procedural until the kit loads');
  assert.ok(root.getObjectByName('leg0'));
  // Feed the shared kit a stand-in scene (the tests have no network).
  (creatureKit as unknown as { loadScene: () => Promise<T.Group> }).loadScene = fakeKit({ boar: BOAR });
  await creatureKit.load();
  w.update(.025, true, false); // caches leg lookups on the old model
  root.rotation.y = 1.2; boar.hp = 30; const at = root.position.clone();
  w.restyleCreatures();
  assert.equal(boar.mesh, root, 'same entity root');
  assert.equal(root.userData.creatureArt, true);
  assert.equal(root.rotation.y, 1.2); assert.ok(root.position.equals(at)); assert.equal(root.scale.x, scale); assert.equal(boar.hp, 30);
  assert.ok((root.userData.flashMaterials as T.Material[]).length >= 1, 'hit flash materials point at the new parts');
  assert.ok((root.userData.outlines as T.Mesh[]).length >= 5, 'outlines follow the new parts');
  assert.equal(root.userData.legs, undefined, 'animation lookups are redone on the new parts');
  assert.ok(root.getObjectByName('creature-body'));
  assert.equal(wolf.mesh.userData.creatureArt, false, 'a creature without art in the kit keeps its shapes');
  w.update(.025, true, false);
  assert.equal((root.userData.legs as T.Object3D[]).length, 4);
  // New spawns use the kit straight away.
  assert.equal(w.spawnSpecies('boar', 48, 0, 2)!.mesh.userData.creatureArt, true);
});
