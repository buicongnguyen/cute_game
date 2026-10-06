import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { readFileSync } from 'node:fs';
import { makeShot, poseShot, lookOf, LOOK_OF } from '../src/shot-art.ts';
import { makeSummon, animateSummon } from '../src/summon-art.ts';

const verts = (g: T.Object3D) => { let n = 0; g.traverse(o => { if (o instanceof T.Mesh) { const a = o.geometry.getAttribute('position'); n += o.geometry.index ? o.geometry.index.count : a.count; } }); return n; };
// Every shot kind combat.ts can emit (shoot('x'), shot ids in content, pet shots).
const emitted = () => {
  const src = readFileSync(new URL('../src/combat.ts', import.meta.url), 'utf8'), kinds = new Set<string>();
  for (const m of src.matchAll(/shoot\('([a-z]+)'/g)) kinds.add(m[1]);
  for (const m of src.matchAll(/'(rocket|missile)'/g)) kinds.add(m[1]);
  for (const m of src.matchAll(/(?:nova'\?'|\?)'(spike|ice)'/g)) kinds.add(m[1]);
  ['fire', 'ice', 'rainbow', 'bubble', 'arrow', 'boulder', 'snowball', 'fireball', 'bigbubble'].forEach(k => kinds.add(k));
  return [...kinds];
};
test('every emitted shot kind maps to a defined look, and only the plain pea is a bead', () => {
  for (const k of emitted()) { assert.ok(k in LOOK_OF, k + ' has no look'); }
  for (const [k, look] of Object.entries(LOOK_OF)) assert.equal(lookOf(k), look);
  assert.equal(Object.entries(LOOK_OF).filter(([, l]) => l === 'bead').map(([k]) => k).join(), 'pea');
});
test('makeShot builds a pooled-size group within the vertex budget for every kind', () => {
  for (const k of Object.keys(LOOK_OF)) for (const r of [.22, .5, 1.3]) {
    const g = makeShot(k, r, '#ff9857'); assert.ok(g instanceof T.Group); assert.equal(g.userData.look, lookOf(k));
    assert.ok(g.children.length >= 1 && g.children.length <= 24, k + ' children ' + g.children.length);
    assert.ok(verts(g) <= 1600, k + ' vertices ' + verts(g));
    poseShot(g, 1, 1, 1, 0, 1, 2.3); assert.ok(Number.isFinite(g.position.x + g.rotation.y + g.scale.x));
  }
});
test('shots share geometries and materials between instances', () => {
  const a = makeShot('rocket', .22, '#ff985f'), b = makeShot('rocket', .22, '#ff985f'), geos = (g: T.Group) => { const s = new Set<T.BufferGeometry>(); g.traverse(o => { if (o instanceof T.Mesh) s.add(o.geometry); }); return s; };
  for (const geo of geos(a)) assert.ok(geos(b).has(geo));
});
test('allies build within budget and animate without throwing', () => {
  for (const k of ['clone', 'turret', 'cannon', 'bat', 'snowman'] as const) { const m = makeSummon(k); assert.ok(verts(m) <= 4000, k + ' ' + verts(m)); animateSummon(m, k, 1.7); }
  assert.ok(makeSummon('turret').getObjectByName('spinner') && makeSummon('turret').getObjectByName('flash'));
});
test('water and dragon crescents turn to face their flight, so they bulge forward', () => {
  for (const kind of ['wave', 'dragon']) {
    const g = makeShot(kind, .4, '#ffffff'); assert.ok(g.userData.yaw || g.userData.yawArc, kind);
    poseShot(g, 0, 1, 0, 1, 0, 0); assert.ok(Math.abs(g.rotation.y - Math.PI / 2) < 1e-9, kind + ' faces +x');
    poseShot(g, 0, 1, 0, 0, -1, 0); assert.ok(Math.abs(Math.abs(g.rotation.y) - Math.PI) < 1e-9, kind + ' faces -z');
  }
});
