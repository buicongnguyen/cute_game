import * as T from 'three';

/**
 * What a flying shot looks like (combat-view.ts places them). Every kind has its own cheap shape, drawn from shared
 * geometries and shared materials, plus one additive halo sprite: a shot costs a few tiny meshes and no allocation, and
 * finished shots go back to a pool. A pea is a bead, a star spins, a wave is a crescent, a shard or thorn points where
 * it flies, a fireball drags a flame, a bubble is a glassy ball.
 */
export type ShotLook = 'bead' | 'star' | 'crescent' | 'shard' | 'thorn' | 'fire' | 'bubble' | 'arrow' | 'rainbow' | 'missile' | 'rock' | 'snow';
const LOOK_OF: Record<string, ShotLook> = {
  pea: 'bead', star: 'star', wave: 'crescent', ice: 'shard', spike: 'thorn', fire: 'fire', fireball: 'fire', bubble: 'bubble', bigbubble: 'bubble',
  arrow: 'arrow', rainbow: 'rainbow', missile: 'missile', boulder: 'rock', snowball: 'snow',
};
export const lookOf = (kind: string): ShotLook => LOOK_OF[kind] ?? 'bead';

const geo = new Map<string, T.BufferGeometry>(), mats = new Map<string, T.Material>();
const shared = <G extends T.BufferGeometry>(key: string, make: () => G) => { let g = geo.get(key); if (!g) geo.set(key, g = make()); return g as G; };
const basic = (color: string, opacity = 1) => { const key = color + opacity; let m = mats.get(key); if (!m) mats.set(key, m = new T.MeshBasicMaterial({ color, transparent: opacity < 1, opacity, side: T.DoubleSide, depthWrite: opacity >= 1 })); return m; };
/** A saturated, mid-light version of a colour: pale shots vanish against grass and snow. */
const vivid = (color: string) => { const c = new T.Color(color), h = { h: 0, s: 0, l: 0 }; c.getHSL(h); return '#' + c.setHSL(h.h, Math.max(.75, h.s), .52).getHexString(); };
const inkMat = () => { let m = mats.get('ink') as T.MeshBasicMaterial | undefined; if (!m) mats.set('ink', m = new T.MeshBasicMaterial({ color: '#25331f', side: T.BackSide, transparent: true, opacity: .6, depthWrite: false })); return m; };
let haloTexture: T.CanvasTexture | null = null;
const halo = (color: string) => {
  const key = 'halo' + color; let m = mats.get(key) as T.SpriteMaterial | undefined;
  if (!m) {
    if (!haloTexture) {
      const c = document.createElement('canvas'); c.width = c.height = 32; const g = c.getContext('2d')!;
      const grad = g.createRadialGradient(16, 16, 0, 16, 16, 16); grad.addColorStop(0, 'rgba(255,255,255,1)'); grad.addColorStop(.35, 'rgba(255,255,255,.45)'); grad.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grad; g.fillRect(0, 0, 32, 32); haloTexture = new T.CanvasTexture(c);
    }
    mats.set(key, m = new T.SpriteMaterial({ map: haloTexture, color, blending: T.AdditiveBlending, transparent: true, depthWrite: false, opacity: .55 }));
  }
  return m;
};
const starShape = () => { const s = new T.Shape(); for (let i = 0; i < 10; i++) { const r = i % 2 ? .22 : .5, a = Math.PI / 2 + i * Math.PI / 5; i ? s.lineTo(Math.cos(a) * r, Math.sin(a) * r) : s.moveTo(Math.cos(a) * r, Math.sin(a) * r); } return new T.ShapeGeometry(s); };

/** A fresh shot object of this kind (callers pool it): `core` meshes plus a halo, scaled by the projectile's radius. */
export function makeShot(kind: string, radius: number, color: string): T.Group {
  const look = lookOf(kind), g = new T.Group(), r = Math.max(.14, radius);
  const add = (geometry: T.BufferGeometry, material: T.Material, scale: [number, number, number] = [1, 1, 1], at: [number, number, number] = [0, 0, 0], rot: [number, number, number] = [0, 0, 0]) => {
    const m = new T.Mesh(geometry, material); m.scale.set(...scale); m.position.set(...at); m.rotation.set(...rot); g.add(m); return m;
  };
  const ball = shared('ball', () => new T.IcosahedronGeometry(1, 1)), col = vivid(color);
  const inked = (k: number, at: [number, number, number] = [0, 0, 0]) => add(ball, inkMat(), [k * 1.22, k * 1.22, k * 1.22], at);
  let haloSize = 5, haloColor = color;
  switch (look) {
    case 'star': { const inner = new T.Group(); inner.name = 'spin'; g.add(inner); const m = new T.Mesh(shared('star', starShape), basic('#ffe45e')); m.scale.setScalar(r * 2.6); inner.add(m); const core = new T.Mesh(shared('star', starShape), basic('#ffffff')); core.scale.setScalar(r * 1.2); core.position.z = .01; inner.add(core); g.userData.billboard = true; haloColor = '#ffd84a'; break; }
    case 'crescent': add(shared('crescent', () => new T.RingGeometry(.42, .62, 14, 1, -Math.PI / 3, Math.PI * 2 / 3)), basic(vivid(color), .95), [r * 3.8, r * 3.8, 1], [0, 0, 0], [-Math.PI / 2, 0, 0]); g.userData.yawArc = true; haloSize = 3.6; break;
    case 'shard': add(shared('shard', () => new T.OctahedronGeometry(1)), basic('#d9f6ff'), [r * 1.1, r * 1.1, r * 3]); add(shared('shard', () => new T.OctahedronGeometry(1)), basic('#4fb8e8', .6), [r * 1.35, r * 1.35, r * 3.3]); g.userData.yaw = true; break;
    case 'thorn': add(shared('cone', () => new T.ConeGeometry(1, 2.4, 6)), basic('#b4d94a'), [r * 1.0, r * 1.0, r * 1.0], [0, 0, 0], [Math.PI / 2, 0, 0]); g.userData.yaw = true; haloSize = 3; break;
    case 'fire': add(ball, basic('#fff1c2'), [r * .9, r * .9, r * .9]); add(ball, basic('#ff8a3c', .85), [r * 1.4, r * 1.4, r * 1.4]); add(shared('cone', () => new T.ConeGeometry(1, 2.4, 6)), basic('#ff6a2a', .75), [r * .9, r * .9, r * 1.2], [0, 0, -r * 1.7], [-Math.PI / 2, 0, 0]); g.userData.yaw = true; g.userData.flicker = true; haloColor = '#ff8a3c'; haloSize = 6; break;
    case 'bubble': inked(r); add(ball, basic(col, .45), [r, r, r]); add(ball, basic('#ffffff', .8), [r * .28, r * .28, r * .28], [-r * .3, r * .3, 0]); haloSize = 4; break;
    case 'arrow': add(shared('shaft', () => new T.CylinderGeometry(.5, .5, 3, 5)), basic('#c79a5a'), [r * .4, r * .4, r * .4], [0, 0, 0], [Math.PI / 2, 0, 0]); add(shared('cone', () => new T.ConeGeometry(1, 2.4, 6)), basic('#e8eef2'), [r * .8, r * .8, r * .8], [0, 0, r * 2.2], [Math.PI / 2, 0, 0]); g.userData.yaw = true; haloSize = 2.5; break;
    case 'rainbow': ['#ff4f4f', '#ffd23e', '#4fb8ff'].forEach((c, i) => add(ball, basic(c), [r * (1 - i * .15), r * (1 - i * .15), r * (1 - i * .15)], [0, 0, -i * r * 1.2])); g.userData.yaw = true; haloColor = '#ffffff'; break;
    case 'missile': add(shared('shaft', () => new T.CylinderGeometry(.5, .5, 3, 6)), basic('#e6e9ee'), [r * .4, r * .4, r * .4], [0, 0, 0], [Math.PI / 2, 0, 0]); add(shared('cone', () => new T.ConeGeometry(1, 2.4, 6)), basic('#e8453c'), [r * .4, r * .4, r * .4], [0, 0, r * 1.5], [Math.PI / 2, 0, 0]); add(shared('cone', () => new T.ConeGeometry(1, 2.4, 6)), basic('#ffb347', .8), [r * .35, r * .35, r * .9], [0, 0, -r * 1.7], [-Math.PI / 2, 0, 0]); g.userData.yaw = true; haloColor = '#ffb347'; haloSize = 4; break;
    case 'rock': add(shared('rock', () => new T.DodecahedronGeometry(1)), basic('#8c7a64'), [r, r * .85, r]); g.userData.spin3 = true; haloSize = 0; break;
    case 'snow': inked(r * 1.3); add(ball, basic('#ffffff'), [r * 1.3, r * 1.3, r * 1.3]); haloColor = '#9fd8ff'; haloSize = 3.2; break;
    default: inked(r * 1.45); add(ball, basic(kind === 'pea' ? '#e4ff5e' : col), [r * 1.45, r * 1.45, r * 1.45]); add(ball, basic('#ffffff', .85), [r * .6, r * .6, r * .6], [-r * .3, r * .3, 0]); haloSize = 4.4;
  }
  if (haloSize > 0 && typeof document !== 'undefined') { const s = new T.Sprite(halo(haloColor)); s.scale.setScalar(r * haloSize); s.name = 'halo'; g.add(s); g.userData.haloBase = r * haloSize; }
  g.userData.look = look; g.userData.kind = kind;
  return g;
}

/** Per frame: where the shot is, which way it points, and its little animation (spin, pulse, flicker). */
export function poseShot(g: T.Group, x: number, y: number, z: number, dx: number, dz: number, time: number) {
  g.position.set(x, y, z);
  const u = g.userData;
  if (u.yaw || u.yawArc) g.rotation.y = Math.atan2(dx, dz);
  if (u.billboard) { g.rotation.set(-.9, 0, 0); const spin = g.getObjectByName('spin'); if (spin) spin.rotation.z = time * 9; }
  if (u.spin3) g.rotation.set(time * 7, time * 5, 0);
  const halo = g.getObjectByName('halo'); if (halo && u.haloBase) halo.scale.setScalar(u.haloBase * (1 + .12 * Math.sin(time * 18 + x)));
  if (u.flicker) g.scale.setScalar(1 + .1 * Math.sin(time * 30));
}
