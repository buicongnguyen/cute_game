// Remote players and bots merge each rigid part's plain toon meshes into one (like the friends), but only pieces that
// look identical through the shared material, and the merged piece keeps its shadow flags.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { mergeParts, mergesExactly } from '../src/avatar-merge.ts';
import { toonMaterial } from '../src/toon.ts';

const box = (material: T.Material, x = 0) => { const m = new T.Mesh(new T.BoxGeometry(1, 1, 1), material); m.position.x = x; return m; };
const meshesUnder = (o: T.Object3D) => { const out: T.Mesh[] = []; o.traverse(c => { if (c instanceof T.Mesh) out.push(c); }); return out; };

test('exact merging joins plain toon pieces of one part and keeps shadow flags', () => {
  const root = new T.Group(), arm = new T.Group(); arm.name = 'arm'; root.add(arm);
  const a = box(toonMaterial({ color: '#ff0000' }), 0), b = box(toonMaterial({ color: '#00ff00' }), 2), c = box(toonMaterial({ color: '#0000ff' }), 4);
  a.castShadow = b.castShadow = true; c.castShadow = false; c.receiveShadow = true;
  arm.add(a, b, c);
  mergeParts(root, { exact: true });
  const parts = meshesUnder(root);
  assert.equal(parts.length, 2, 'two shadow classes -> two draws');
  assert.ok(parts.some(m => m.castShadow && !m.receiveShadow) && parts.some(m => !m.castShadow && m.receiveShadow));
  const total = parts.reduce((n, m) => n + m.geometry.getAttribute('position').count, 0);
  assert.equal(total, 2 * 36 + 24, 'a and b merged (non-indexed), c untouched');
});

test('exact merging leaves flat-shaded, textured or see-through pieces alone', () => {
  const root = new T.Group(), part = new T.Group(); root.add(part);
  part.add(box(toonMaterial({ color: '#fff' })), box(toonMaterial({ color: '#fff' }), 1));
  const flat = toonMaterial({ color: '#fff', flatShading: true }), glass = toonMaterial({ color: '#fff', transparent: true, opacity: .5 }), back = toonMaterial({ color: '#fff' }); back.side = T.DoubleSide;
  part.add(box(flat), box(glass), box(back));
  assert.equal(mergesExactly(flat as T.MeshToonMaterial), false);
  assert.equal(mergesExactly(back as T.MeshToonMaterial), false);
  mergeParts(root, { exact: true });
  assert.equal(meshesUnder(root).length, 4, 'one merged piece plus the three that must stay');
});

test('the friend path (not exact) still merges everything plain into one piece per part', () => {
  const root = new T.Group(), part = new T.Group(); root.add(part);
  part.add(box(toonMaterial({ color: '#fff' })), box(toonMaterial({ color: '#fff', flatShading: true }), 1));
  mergeParts(root);
  assert.equal(meshesUnder(root).length, 1);
});
