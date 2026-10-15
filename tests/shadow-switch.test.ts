import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { ShadowSwitch } from '../src/shadow-switch.ts';

/** A stand-in renderer: records what compile is given and hands out programs whose readiness the test controls. */
function fixture(ready = () => true) {
  const scene = new T.Scene(), sun = new T.DirectionalLight(); sun.castShadow = true; scene.add(sun, new T.HemisphereLight());
  scene.fog = new T.Fog('#fff', 10, 100);
  const shared = new T.MeshLambertMaterial(), parent = new T.Mesh(new T.BoxGeometry(), new T.MeshLambertMaterial());
  parent.add(new T.Mesh(new T.BoxGeometry(), shared)); scene.add(parent, new T.Mesh(new T.BoxGeometry(), shared));
  scene.add(new T.InstancedMesh(new T.BoxGeometry(), shared, 4));
  const calls: { children: number; shadowMap: boolean; rigSun?: boolean; fog: unknown }[] = [];
  const props = new Map<T.Material, { currentProgram: { isReady: () => boolean; getUniforms: () => object } }>();
  const renderer = {
    shadowMap: { enabled: true },
    properties: { get: (m: T.Material) => props.get(m) ?? {} },
    compile(obj: T.Object3D, _camera: T.Camera, rig: T.Scene) {
      let rigSun: boolean | undefined; rig.traverse(o => { if ((o as T.DirectionalLight).isDirectionalLight) rigSun = o.castShadow; });
      calls.push({ children: obj.children.length, shadowMap: renderer.shadowMap.enabled, rigSun, fog: rig.fog });
      const m = (obj as T.Mesh).material as T.Material; props.set(m, { currentProgram: { isReady: ready, getUniforms: () => ({}) } }); return new Set([m]);
    },
  };
  const sw = new ShadowSwitch({ renderer: renderer as unknown as T.WebGLRenderer, camera: new T.PerspectiveCamera(), sun, scene: () => scene });
  return { sw, renderer, sun, scene, calls, shared };
}

test('switching shadows off prepares the programs over frames first, then flips', () => {
  const f = fixture();
  f.sw.request(false);
  assert.equal(f.renderer.shadowMap.enabled, true, 'nothing changes at the request');
  assert.equal(f.sun.castShadow, true);
  let frames = 0; while (!f.sw.step() && frames < 50) frames++;
  assert.ok(frames >= 1, 'compiling and flipping happen on different frames');
  assert.equal(f.renderer.shadowMap.enabled, false); assert.equal(f.sun.castShadow, false); assert.equal(f.sw.target, null);
  // Each distinct material + kind once (the shared material twice: on a mesh and on an instanced mesh), never a subtree.
  assert.equal(f.calls.length, 3);
  assert.ok(f.calls.every(c => c.children === 0), 'the stand-in carries no children');
  assert.ok(f.calls.every(c => c.rigSun === false && c.shadowMap === false && c.fog === f.scene.fog), 'compiled against the off variant with the scene fog');
  assert.equal(f.renderer.shadowMap.enabled, false, 'the renderer flag is restored after each compile');
  assert.ok(f.shared.version > 0, 'the flip asks every material to pick its program again');
});

test('the flip waits for the GPU, and a request for the current state cancels', () => {
  let linked = false; const f = fixture(() => linked);
  f.sw.request(false);
  for (let i = 0; i < 10; i++) assert.equal(f.sw.step(), false, 'not while programs are still linking');
  assert.equal(f.sun.castShadow, true);
  f.sw.request(true); assert.equal(f.sw.target, null, 'asking for what is on cancels the pending switch');
  assert.equal(f.sw.step(), false); assert.equal(f.sun.castShadow, true);
  f.sw.request(false); linked = true; while (!f.sw.step());
  assert.equal(f.sun.castShadow, false);
  f.sw.request(true); while (!f.sw.step());
  assert.equal(f.sun.castShadow, true); assert.equal(f.renderer.shadowMap.enabled, true, 'and back on the same way');
  assert.ok(f.calls.slice(-3).every(c => c.rigSun === true && c.shadowMap === true));
});

test('flip switches at once (used before the first frame)', () => {
  const f = fixture();
  f.sw.flip(false); assert.equal(f.sun.castShadow, false); assert.equal(f.renderer.shadowMap.enabled, false); assert.equal(f.calls.length, 0);
});
