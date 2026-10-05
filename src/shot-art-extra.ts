import * as T from 'three';

/**
 * Extra shot looks (shot-art.ts owns the shared pools and calls these builders). Every builder only adds a handful of
 * meshes from shared geometries and shared materials, and registers cheap animations in `g.userData.anim` that
 * poseShot() plays without allocating: flapping wings, smoke puffs, wobbling beads, jagged flicker, twinkling sparkles.
 * Shots fly along +z; flat shapes lie on the ground plane (shape +y = forward).
 */
export type Add = (geometry: T.BufferGeometry, material: T.Material, scale?: [number, number, number], at?: [number, number, number], rot?: [number, number, number]) => T.Mesh;
export interface Kit {
  g: T.Group; r: number; col: string; add: Add; ball: T.BufferGeometry; lowBall: T.BufferGeometry;
  shared: <G extends T.BufferGeometry>(key: string, make: () => G) => G; basic: (color: string, opacity?: number) => T.Material;
  inked: (k: number, at?: [number, number, number]) => T.Mesh; sparkle: (color: string, size: number, at?: [number, number, number], phase?: number) => void;
}
export type Anim = { o: T.Object3D; t: 'flap' | 'puff' | 'wob' | 'swirl' | 'flick' | 'twinkle' | 'zig' | 'spinz' | 'orbit'; a: number; b: number };
const PI = Math.PI;
const note = (g: T.Group, o: T.Object3D, t: Anim['t'], a = 0, b = 0) => { ((g.userData.anim ??= []) as Anim[]).push({ o, t, a, b }); };
export const noteAnim = note;

/** A wing: a swept flat blade whose root is at the origin and which points along +x (mirror with scale.x = -1). */
const wingShape = () => { const s = new T.Shape(); s.moveTo(0, .25); s.quadraticCurveTo(.5, .55, 1.15, .1); s.lineTo(.9, -.05); s.lineTo(1.0, -.3); s.lineTo(.7, -.22); s.lineTo(.45, -.5); s.lineTo(.25, -.15); s.lineTo(0, -.3); return new T.ShapeGeometry(s); };
const boltShape = () => { const s = new T.Shape(), p: Array<[number, number]> = [[0, 1.1], [.22, .45], [.06, .45], [.3, -.1], [.1, -.1], [.28, -1], [-.22, -.05], [-.05, -.05], [-.28, .5], [-.1, .5]]; p.forEach(([x, y], i) => i ? s.lineTo(x, y) : s.moveTo(x, y)); return new T.ShapeGeometry(s); };
const shurikenShape = () => { const s = new T.Shape(); for (let i = 0; i < 8; i++) { const r = i % 2 ? .2 : .55, a = i * PI / 4 + PI / 8; i ? s.lineTo(Math.cos(a) * r, Math.sin(a) * r) : s.moveTo(Math.cos(a) * r, Math.sin(a) * r); } return new T.ShapeGeometry(s); };
const bladeShape = () => { const s = new T.Shape(); s.moveTo(0, .55); s.quadraticCurveTo(.2, .1, 0, -.55); s.quadraticCurveTo(-.08, 0, 0, .55); return new T.ShapeGeometry(s); };
const flat = [PI / 2, 0, 0] as [number, number, number];

export function buildExtra(look: string, k: Kit): { haloSize?: number; haloColor?: string } | null {
  const { g, r, add, shared, basic, ball, lowBall } = k;
  const cone = () => shared('cone', () => new T.ConeGeometry(1, 2.4, 6));
  switch (look) {
    case 'water': { // a blue-white surf blade: bulging crescent, foam rim, droplets that trail behind
      add(shared('wave-a', () => new T.RingGeometry(.5, .82, 16, 1, PI / 2 - 1.0, 2.0)), basic('#2f9bff', .96), [r * 4.2, r * 4.2, 1], [0, 0, 0], flat);
      add(shared('wave-b', () => new T.RingGeometry(.74, .88, 16, 1, PI / 2 - .95, 1.9)), basic('#f4feff'), [r * 4.2, r * 4.2, 1], [0, .02, .0], flat);
      for (let i = 0; i < 3; i++) { const d = add(lowBall, basic('#ffffff', .9), [r * .3, r * .3, r * .3], [(i - 1) * r * 1.6, 0, -r * (1.4 + i % 2 * .8)]); note(g, d, 'puff', i / 3, r * 2.4); }
      return { haloSize: 3.4, haloColor: '#66c4ff' };
    }
    case 'dragon': { // a golden scale crescent with a red edge and three spines
      add(shared('wave-a', () => new T.RingGeometry(.5, .82, 16, 1, PI / 2 - 1.0, 2.0)), basic('#ffb81f', .98), [r * 3.8, r * 3.8, 1], [0, 0, 0], flat);
      add(shared('wave-c', () => new T.RingGeometry(.8, .92, 16, 1, PI / 2 - .95, 1.9)), basic('#e8352b'), [r * 3.8, r * 3.8, 1], [0, 0, 0], flat);
      for (let i = -1; i <= 1; i++) add(cone(), basic('#fff0a0'), [r * .35, r * .35, r * .5], [i * r * 1.9, 0, r * (3.1 - Math.abs(i) * .9)], [PI / 2, 0, 0]);
      return { haloSize: 4, haloColor: '#ffc83a' };
    }
    case 'shuriken': { // four-point steel star with a hub hole, spinning flat
      const spin = new T.Group(); g.add(spin); note(g, spin, 'spinz', 18);
      const star = new T.Mesh(shared('shuriken', shurikenShape), basic('#cfd8e6')); star.scale.setScalar(r * 3); spin.add(star);
      const hub = new T.Mesh(lowBall, basic('#2a2f45')); hub.scale.set(r * .55, r * .55, r * .2); hub.position.z = .01; spin.add(hub);
      spin.rotation.x = PI / 2; g.userData.yaw = true; return { haloSize: 2.4, haloColor: '#aab6ff' };
    }
    case 'bolt': { // a jagged zig-zag lightning bolt
      const m = add(shared('bolt', boltShape), basic('#fff7a8'), [r * 2.8, r * 2.8, 1], [0, 0, 0], flat); note(g, m, 'zig', r * 2.8, 0);
      add(shared('bolt', boltShape), basic('#ffd02a', .7), [r * 3.5, r * 3.5, 1], [0, -.01, 0], flat);
      g.userData.yaw = true; return { haloSize: 5, haloColor: '#ffe45e' };
    }
    case 'thorn': { // a barbed thorn: long green spike, red-tipped, two side barbs
      add(cone(), basic('#7cc233'), [r * 1.1, r * 1.1, r * 1.5], [0, 0, r * .8], [PI / 2, 0, 0]);
      add(cone(), basic('#d8324a'), [r * .45, r * .45, r * .7], [0, 0, r * 4.3], [PI / 2, 0, 0]);
      add(shared('cyl', () => new T.CylinderGeometry(.6, 1, 1, 6)), basic('#4f8a24'), [r * 1.3, r * .5, r * 1.3], [0, 0, -r * 1.4], [PI / 2, 0, 0]);
      for (const s of [-1, 1]) add(cone(), basic('#9ed94a'), [r * .4, r * .4, r * .6], [s * r * .7, 0, r * .3], [PI / 2, 0, s * .9]);
      g.userData.yaw = true; return { haloSize: 2.6, haloColor: '#c8f070' };
    }
    case 'cannonball': { // an iron ball with a glowing fuse spark
      k.inked(r * 1.5); add(ball, basic('#2b2f3a'), [r * 1.5, r * 1.5, r * 1.5]); add(ball, basic('#6a7488'), [r * .5, r * .5, r * .5], [-r * .5, r * .6, r * .3]);
      add(shared('cyl', () => new T.CylinderGeometry(.6, 1, 1, 6)), basic('#8a6a3a'), [r * .25, r * .5, r * .25], [0, r * 1.6, 0]);
      const spark = add(lowBall, basic('#ffd23a'), [r * .5, r * .5, r * .5], [0, r * 2.2, 0]); spark.userData.base = r * .5; note(g, spark, 'twinkle', 0, 1); k.sparkle('#ffb02a', r * 3, [0, r * 2.2, 0], 0);
      return { haloSize: 3, haloColor: '#ff9a2a' };
    }
    case 'drain': { // a red life-drain orb: deep core, bright heart and a wisp tail
      k.inked(r * 1.3); add(ball, basic('#c2183e'), [r * 1.3, r * 1.3, r * 1.3]); add(ball, basic('#ff6b8a'), [r * .85, r * .85, r * .85], [0, 0, r * .1]); add(lowBall, basic('#ffe0e8'), [r * .35, r * .35, r * .35], [-r * .3, r * .4, r * .4]);
      const tail = add(cone(), basic('#ff3a64', .7), [r * .9, r * .9, r * 1.6], [0, 0, -r * 1.9], [-PI / 2, 0, 0]); note(g, tail, 'flick', r, 0);
      g.userData.yaw = true; return { haloSize: 5, haloColor: '#ff3a6a' };
    }
    case 'bat': { // a small bat silhouette with flapping wings, ears and red eyes
      add(ball, basic('#4a2a5c'), [r * .7, r * .7, r * 1.1]); add(lowBall, basic('#4a2a5c'), [r * .6, r * .6, r * .6], [0, r * .1, r * 1.0]);
      for (const s of [-1, 1]) { add(cone(), basic('#4a2a5c'), [r * .22, r * .22, r * .45], [s * r * .3, r * .6, r * 1.1]); add(lowBall, basic('#ff5a4a'), [r * .12, r * .12, r * .12], [s * r * .25, r * .2, r * 1.5]);
        const p = new T.Group(); p.position.set(s * r * .4, 0, 0); g.add(p); const w = new T.Mesh(shared('wing', wingShape), basic('#6b3f86')); w.scale.set(s * r * 2.3, r * 2.3, 1); w.rotation.x = PI / 2; p.add(w); note(g, p, 'flap', s, 0); }
      g.userData.yaw = true; return { haloSize: 2.4, haloColor: '#a06ad0' };
    }
    case 'eagle': { // an eagle swooping: white head, brown body and broad swept wings, hooked yellow beak
      add(ball, basic('#7a4a22'), [r * .8, r * .7, r * 1.7]); add(lowBall, basic('#fbfbf2'), [r * .6, r * .6, r * .65], [0, r * .15, r * 1.7]); add(cone(), basic('#ffc21f'), [r * .22, r * .22, r * .45], [0, 0, r * 2.4], [PI / 2, 0, 0]);
      add(cone(), basic('#5f3818'), [r * .7, r * .15, r * .8], [0, 0, -r * 2.1], [-PI / 2, 0, 0]);
      for (const s of [-1, 1]) { const p = new T.Group(); p.position.set(s * r * .5, 0, r * .2); g.add(p); const w = new T.Mesh(shared('wing', wingShape), basic('#8a5528')); w.scale.set(s * r * 4.2, r * 4.2, 1); w.rotation.x = PI / 2; p.add(w); note(g, p, 'flap', s, 0); }
      g.userData.yaw = true; return { haloSize: 3, haloColor: '#fff0c0' };
    }
    case 'parrot': { // a small parrot: red body, blue wing, yellow tail and a hooked beak
      add(ball, basic('#e83a3a'), [r * .7, r * .7, r * 1.1]); add(lowBall, basic('#ff5a4a'), [r * .55, r * .55, r * .55], [0, r * .3, r * 1.0]); add(cone(), basic('#ffd23a'), [r * .2, r * .2, r * .38], [0, r * .2, r * 1.6], [PI / 2, 0, 0]);
      add(lowBall, basic('#ffffff'), [r * .16, r * .16, r * .16], [r * .3, r * .5, r * 1.15]);
      add(cone(), basic('#2fb0ff'), [r * .35, r * .1, r * 1.2], [0, 0, -r * 1.7], [-PI / 2, 0, 0]);
      for (const s of [-1, 1]) { const p = new T.Group(); p.position.set(s * r * .55, r * .1, 0); g.add(p); const w = new T.Mesh(shared('wing', wingShape), basic('#2f8cff')); w.scale.set(s * r * 2.2, r * 2.2, 1); w.rotation.x = PI / 2; p.add(w); note(g, p, 'flap', s, 0); }
      g.userData.yaw = true; return { haloSize: 2.4, haloColor: '#ffd0a0' };
    }
    case 'anchor': { // an anchor with a short chain: shank, stock bar, ring, curved flukes
      const ironM = basic('#4b5870'), tor = (key: string, arc: number) => shared(key, () => new T.TorusGeometry(1, .22, 4, 8, arc));
      add(shared('cyl', () => new T.CylinderGeometry(.6, 1, 1, 6)), ironM, [r * .28, r * 3.2, r * .28], [0, 0, 0], [PI / 2, 0, 0]);
      add(shared('box', () => new T.BoxGeometry(1, 1, 1)), ironM, [r * 1.8, r * .26, r * .26], [0, 0, r * 1.2]);
      add(tor('ring', PI * 2), ironM, [r * .5, r * .5, r * .5], [0, 0, r * 1.8]);
      add(tor('fluke', PI), ironM, [r * 1.2, r * 1.2, r * 1.2], [0, 0, -r * 1.5], [0, 0, PI]);
      for (let i = 0; i < 4; i++) add(tor('link', PI * 2), basic('#9aa6bc'), [r * .32, r * .32, r * .32], [0, 0, -r * (3 + i * .9)], [i % 2 ? PI / 2 : 0, 0, 0]);
      g.userData.yaw = true; return { haloSize: 2.2, haloColor: '#9fd6ff' };
    }
  }
  return null;
}

/** Plays the animations registered by buildExtra() and shot-art.ts. No allocation. */
export function playAnims(g: T.Group, time: number, seed: number) {
  const list = g.userData.anim as Anim[] | undefined; if (!list) return;
  for (let i = 0; i < list.length; i++) {
    const n = list[i], o = n.o;
    switch (n.t) {
      case 'flap': o.rotation.z = n.a * Math.sin(time * 20 + seed) * .7; break;
      case 'puff': { const ph = (time * 3 + n.a) % 1; o.position.z = -n.b * (.5 + ph); o.scale.setScalar(Math.max(.01, n.b * .22 * (1 - ph * .6))); break; }
      case 'wob': o.position.x = Math.sin(time * 12 + n.a) * n.b; break;
      case 'swirl': o.rotation.z = time * n.a; break;
      case 'flick': o.scale.z = n.a * (1.4 + .5 * Math.sin(time * 34 + seed)); break;
      case 'twinkle': o.scale.setScalar(Math.max(.02, n.a ? n.a * (.6 + .5 * Math.sin(time * 26)) : (.5 + .5 * Math.abs(Math.sin(time * 9 + n.b))) * (o.userData.base ?? 1))); break;
      case 'zig': o.scale.x = n.a * (.85 + .3 * Math.abs(Math.sin(time * 40 + seed))); break;
      case 'spinz': o.rotation.y = time * n.a; break;
      case 'orbit': o.rotation.z = time * n.a + n.b; break;
    }
  }
}
export { bladeShape };
