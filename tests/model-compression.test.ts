import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import * as T from 'three';
import { createGltfLoader } from '../src/assets.ts';
import { EXT, compressGlb, decodeGlb, readGlb } from '../art/compress-models.mjs';

// FIX-PLAN 2.1: every model ships meshopt-compressed (npm run art:compress after a Blender generator installs one).
const dir = new URL('../public/assets/models/', import.meta.url);
const files = readdirSync(dir).filter(name => name.endsWith('.glb')).sort();
const bytes = (name: string) => readFileSync(new URL(name, dir));
const parse = async (data: Buffer) => (await createGltfLoader().parseAsync(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer, '')).scene;
const triangles = (root: T.Object3D) => { let n = 0; root.traverse(o => { if (o instanceof T.Mesh) n += (o.geometry.index?.count ?? o.geometry.getAttribute('position').count) / 3; }); return n; };
const names = (root: T.Object3D) => { const out: string[] = []; root.traverse(o => out.push(o.name)); return out; };

test('every model file is meshopt-compressed (run npm run art:compress after installing a model)', () => {
  assert.ok(files.length > 40);
  const plain = files.filter(name => !readGlb(bytes(name)).json.extensionsRequired?.includes(EXT));
  assert.deepEqual(plain, []);
});

test('the game loader decodes a compressed model into plain float attributes, as Blender wrote them', async () => {
  const hero = await parse(bytes('hero.glb'));
  assert.ok(hero.getObjectByName('arm-left') && hero.getObjectByName('head-leaf'), 'named parts and pivots survive');
  assert.equal(triangles(hero), 3304);
  hero.traverse(o => {
    if (!(o instanceof T.Mesh)) return;
    for (const name of ['position', 'normal']) {
      const a = o.geometry.getAttribute(name) as T.BufferAttribute;
      assert.ok(a.array instanceof Float32Array && !a.normalized && !(a as unknown as T.InterleavedBufferAttribute).isInterleavedBufferAttribute, `${o.name} ${name} is a plain float attribute`);
    }
    const n = o.geometry.getAttribute('normal');
    for (let i = 0; i < n.count; i += 17) assert.ok(Math.abs(Math.hypot(n.getX(i), n.getY(i), n.getZ(i)) - 1) < .02, 'normals stay unit length');
  });
});

test('a decoded copy (for Blender) is a plain GLB, and compressing it again keeps every name and triangle', async () => {
  const source = bytes('cottage.glb'), plain = await decodeGlb(source);
  const doc = readGlb(plain).json;
  assert.ok(!doc.extensionsUsed?.includes(EXT) && doc.buffers.length === 1);
  const again = await compressGlb(plain), [a, b, c] = await Promise.all([source, plain, again].map(parse));
  assert.deepEqual(names(b), names(a)); assert.deepEqual(names(c), names(a));
  assert.equal(triangles(b), triangles(a)); assert.equal(triangles(c), triangles(a));
  const box = (root: T.Object3D) => new T.Box3().setFromObject(root);
  assert.ok(box(c).min.distanceTo(box(a).min) < 1e-3 && box(c).max.distanceTo(box(a).max) < 1e-3, 'the model stays where it was');
});
