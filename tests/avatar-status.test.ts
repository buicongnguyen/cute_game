// Review (high): applyAvatarVisual copied every material of a new avatar on its first frame, so the drawn explorer no
// longer used world.playerMaterials (the hurt flash and the invulnerable blink edit those) and the ink outlines lost their
// push-out shader (Material.clone does not carry onBeforeCompile), leaving every explorer without an outline.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { World } from '../src/world.ts';
import { addOutlines, outlineMaterial } from '../src/outline.ts';

function avatar() {
  const g = new T.Group(), body = new T.Mesh(new T.BoxGeometry(1, 1, 1), new T.MeshToonMaterial({ color: '#ffcc88' }));
  body.userData.statusMaterials = true; // refreshPlayer's own copy (the one the flash edits)
  g.add(body); addOutlines(g); return { g, body, hull: g.getObjectByName('outline') as T.Mesh };
}
const apply = (g: T.Group, visual: Record<string, unknown>) => (Object.create(World.prototype) as { applyAvatarVisual(g: T.Group, v: unknown): void }).applyAvatarVisual(g, visual);

test('a fully visible explorer keeps its own materials and its ink outline every frame', () => {
  const { g, body, hull } = avatar(), material = body.material, ink = hull.material; delete body.userData.statusMaterials; // even a mesh refreshPlayer did not copy
  for (let i = 0; i < 3; i++) apply(g, { stealth: false });
  assert.equal(body.material, material, 'the flash materials are still the drawn ones');
  assert.equal(hull.material, ink, 'the hull still uses the shared ink material'); assert.equal(ink, outlineMaterial());
  assert.notEqual(String((hull.material as T.Material).onBeforeCompile), String(new T.MeshBasicMaterial().onBeforeCompile), 'the push-out patch is kept');
});

test('stealth fades the explorer in place, hides the outline, and both come back', () => {
  const { g, body, hull } = avatar(), material = body.material as T.MeshToonMaterial;
  apply(g, { stealth: true });
  assert.equal(body.material, material, 'faded in place: the flash still reaches it'); assert.equal(material.opacity, .25); assert.equal(hull.visible, false);
  assert.equal(hull.material, outlineMaterial(), 'the hull is hidden, never copied');
  apply(g, { stealth: false }); assert.equal(material.opacity, 1); assert.equal(hull.visible, true);
});

// Review (performance): the creature target pick built and sorted a list for every creature on every step.
test('the creature target pick keeps the nearest as it goes: explorer, remote players, or a charmed creature\'s neighbour', () => {
  const w = Object.assign(Object.create(World.prototype), { planet: 'meadow', playerStealth: false, position: new T.Vector3(30, 0, 0), enemies: [] as unknown[], remotePlayers: new Map([['bob', { mesh: { visible: true }, pose: { x: 0, z: 25 } }]]) }) as Record<string, unknown> & { enemyTarget(e: unknown): unknown };
  const e = { x: 0, z: 20, hp: 10, statuses: {} };
  assert.deepEqual(w.enemyTarget(e), { x: 0, z: 25, id: 'bob' }, 'the nearer remote player');
  (w.position as T.Vector3).set(0, 0, 21); assert.deepEqual(w.enemyTarget(e), { x: 0, z: 21 }, 'the nearer explorer');
  w.playerStealth = true; (w.remotePlayers as Map<string, unknown>).clear(); assert.equal(w.enemyTarget(e), undefined, 'nobody to chase');
  const near = { x: 1, z: 20, hp: 5 }, far = { x: 9, z: 20, hp: 5 }; w.enemies = [far, e, near];
  e.statuses = { charm: 2 } as never; assert.equal((w.enemyTarget(e) as { enemy: unknown }).enemy, near, 'charmed: the nearest other creature');
  const src = (World.prototype as unknown as Record<string, () => void>).enemyTarget.toString(); assert.doesNotMatch(src, /\.sort\(|\.filter\(|\.map\(/, 'no list per call');
});

// Review: a creature measured for its target ring before creatures.glb arrived kept the stand-in's footprint.
test('a creature that gets its real body is measured again for the target ring', async () => {
  const { adoptCreatureModel } = await import('../src/creature-art.ts');
  const root = new T.Group(); root.add(new T.Mesh(new T.BoxGeometry(1, 1, 1))); root.userData.footprint = 4.2; root.userData.pickHeight = 2;
  adoptCreatureModel(root, new T.Group().add(new T.Mesh(new T.BoxGeometry(.4, .4, .4))), () => {});
  assert.equal(root.userData.footprint, undefined); assert.equal(root.userData.pickHeight, undefined);
});
