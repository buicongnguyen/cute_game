import * as T from 'three';
import { buildExtra, noteAnim, playAnims, type Kit } from './shot-art-extra.ts';

/**
 * What a flying shot looks like (combat-view.ts places them). Every kind has its own cheap shape, drawn from shared
 * geometries and shared materials, plus one additive halo sprite: a shot costs a few tiny meshes and no allocation, and
 * finished shots go back to a pool. A pea is a bead, a star spins, a wave is a crescent, a shard or thorn points where
 * it flies, a fireball drags a flame, a bubble is a glassy ball.
 */
export type ShotLook = 'bead' | 'star' | 'crescent' | 'shard' | 'thorn' | 'fire' | 'fireball' | 'bubble' | 'arrow' | 'rainbow' | 'missile' | 'rock' | 'snow'
  | 'water' | 'dragon' | 'shuriken' | 'bolt' | 'cannonball' | 'drain' | 'bat' | 'eagle' | 'parrot' | 'anchor' | 'cork';
export const LOOK_OF: Record<string, ShotLook> = {
  pea: 'bead', star: 'star', lotus: 'star', wave: 'water', surf: 'water', ice: 'shard', spike: 'thorn', thornburst: 'thorn', fire: 'fire', fireball: 'fireball', bubble: 'bubble', bigbubble: 'bubble',
  arrow: 'arrow', rainbow: 'rainbow', missile: 'missile', rocket: 'missile', boulder: 'rock', snowball: 'snow',
  dragon: 'dragon', shuriken: 'shuriken', thunderbolt: 'bolt', cannonball: 'cannonball', cannon: 'cannonball', drain: 'drain', bat: 'bat', eagle: 'eagle', parrot: 'parrot', anchor: 'anchor', hook: 'anchor', cork: 'cork',
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
let sparkTexture: T.CanvasTexture | null = null;
const sparkMat = (color: string) => {
  const key = 'spark' + color; let m = mats.get(key) as T.SpriteMaterial | undefined;
  if (!m) {
    if (!sparkTexture) {
      const c = document.createElement('canvas'); c.width = c.height = 32; const g = c.getContext('2d')!; g.fillStyle = '#fff'; g.beginPath();
      for (let i = 0; i < 8; i++) { const rr = i % 2 ? 3 : 15, a = i * Math.PI / 4 - Math.PI / 2; g.lineTo(16 + Math.cos(a) * rr, 16 + Math.sin(a) * rr); } g.fill(); sparkTexture = new T.CanvasTexture(c);
    }
    mats.set(key, m = new T.SpriteMaterial({ map: sparkTexture, color, blending: T.AdditiveBlending, transparent: true, depthWrite: false }));
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
  const lowBall = shared('lowball', () => new T.IcosahedronGeometry(1, 0)), cone = () => shared('cone', () => new T.ConeGeometry(1, 2.4, 6));
  const kit: Kit = { g, r, col, add, ball, lowBall, shared, basic, inked, sparkle: (c, size, at = [0, 0, 0], phase = 0) => { if (typeof document === 'undefined') return; const sp = new T.Sprite(sparkMat(c)); sp.position.set(...at); sp.scale.setScalar(size); sp.userData.base = size; g.add(sp); noteAnim(g, sp, 'twinkle', 0, phase); } };
  let haloSize = 5, haloColor = color;
  const extra = buildExtra(look, kit);
  if (extra) { haloSize = extra.haloSize ?? 3; haloColor = extra.haloColor ?? color; } else switch (look) {
    case 'star': { const inner = new T.Group(); inner.name = 'spin'; g.add(inner); const m = new T.Mesh(shared('star', starShape), basic('#ffe45e')); m.scale.setScalar(r * 2.6); inner.add(m); const core = new T.Mesh(shared('star', starShape), basic('#ffffff')); core.scale.setScalar(r * 1.2); core.position.z = .01; inner.add(core); g.userData.billboard = true; kit.sparkle('#fff4b0', r * 5, [r * 1.6, r * 1.4, 0], 0); kit.sparkle('#ffd0f0', r * 3.4, [-r * 1.7, -r * .8, 0], 2.1); haloColor = '#ffd84a'; break; }
    case 'shard': add(shared('shard', () => new T.OctahedronGeometry(1)), basic('#e8fbff'), [r * 1.1, r * 1.1, r * 3]); add(shared('shard', () => new T.OctahedronGeometry(1)), basic('#4fb8e8', .6), [r * 1.35, r * 1.35, r * 3.3]); add(shared('shard', () => new T.OctahedronGeometry(1)), basic('#9fe6ff', .9), [r * .7, r * .7, r * 2], [0, 0, -r * .6], [0, 0, Math.PI / 4]); kit.sparkle('#ffffff', r * 3, [0, r * .6, r * 1], 1); g.userData.yaw = true; break;
    case 'fire': {
      add(ball, basic('#fff1c2'), [r * .8, r * .8, r * .8], [0, 0, r * .3]); add(ball, basic('#ff9a2e', .9), [r * 1.2, r * 1.2, r * 1.2]);
      const t1 = add(cone(), basic('#e8352b', .8), [r * 1.1, r * 1.1, r * 1.5], [0, 0, -r * 2], [-Math.PI / 2, 0, 0]), t2 = add(cone(), basic('#ff8a1e', .85), [r * .8, r * .8, r * 1.1], [0, 0, -r * 1.5], [-Math.PI / 2, 0, 0]), t3 = add(cone(), basic('#ffe45e', .9), [r * .45, r * .45, r * .7], [0, 0, -r * 1.1], [-Math.PI / 2, 0, 0]);
      noteAnim(g, t1, 'flick', r * 1.5, 0); noteAnim(g, t2, 'flick', r * 1.1, 1); noteAnim(g, t3, 'flick', r * .7, 2); g.userData.yaw = true; haloColor = '#ff8a3c'; haloSize = 6; break; }
    case 'fireball': {
      add(ball, basic('#fff6cf'), [r * .6, r * .6, r * .6]); add(ball, basic('#ffb02e', .92), [r * .85, r * .85, r * .85]); add(ball, basic('#ff5a1e', .6), [r * 1.1, r * 1.1, r * 1.1]);
      const sw = new T.Group(); g.add(sw); noteAnim(g, sw, 'swirl', 6, 0);
      for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2, m = new T.Mesh(cone(), basic(i % 2 ? '#ff7a1e' : '#ffc02e', .85)); m.position.set(Math.cos(a) * r * .8, Math.sin(a) * r * .8, -r * 1.3); m.scale.set(r * .3, r * .3, r * .85); m.rotation.set(-Math.PI / 2 + Math.sin(a) * .5, Math.cos(a) * .5, 0); sw.add(m); }
      const em = new T.Group(); g.add(em); noteAnim(g, em, 'swirl', -4, 0);
      for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + .4, m = new T.Mesh(lowBall, basic(i % 2 ? '#ffe45e' : '#ff7a1e')); m.position.set(Math.cos(a) * r * 1.5, Math.sin(a) * r * 1.5, -r * (.2 + i * .45)); m.scale.setScalar(r * .15); em.add(m); }
      g.userData.yaw = true; g.userData.flicker = true; haloColor = '#ff8a3c'; haloSize = 4.6; break; }
    case 'bubble': inked(r); add(ball, basic(col, .45), [r, r, r]); add(ball, basic('#ffffff', .8), [r * .28, r * .28, r * .28], [-r * .3, r * .3, 0]); add(lowBall, basic('#ffb3e6', .7), [r * .16, r * .16, r * .16], [r * .4, -r * .4, 0]); add(lowBall, basic('#b3fff0', .7), [r * .12, r * .12, r * .12], [r * .55, -r * .1, 0]); haloSize = 4; break;
    case 'arrow': { const s2 = Math.max(r, .3); add(shared('shaft', () => new T.CylinderGeometry(.5, .5, 3, 5)), basic('#c79a5a'), [s2 * .25, s2 * .9, s2 * .25], [0, 0, 0], [Math.PI / 2, 0, 0]); add(cone(), basic('#e8eef2'), [s2 * .4, s2 * .4, s2 * .45], [0, 0, s2 * 1.5], [Math.PI / 2, 0, 0]);
      add(shared('fin', () => new T.PlaneGeometry(1, 1)), basic('#e8453c'), [s2 * .5, s2 * .6, 1], [0, 0, -s2 * 1.2], [Math.PI / 2, 0, 0]); add(shared('fin', () => new T.PlaneGeometry(1, 1)), basic('#ffffff'), [s2 * .5, s2 * .6, 1], [0, 0, -s2 * 1.2], [0, Math.PI / 2, 0]); g.userData.yaw = true; haloSize = 2.5; break; }
    case 'rainbow': ['#ff4f4f', '#ff9a2e', '#ffd23e', '#5fd35a', '#4fb8ff', '#a06aff'].forEach((c, i) => { const k2 = r * (1.15 - i * .12), m = add(ball, basic(c), [k2, k2, k2], [0, 0, -i * r * 1.0]); noteAnim(g, m, 'wob', i * .9, r * .5); }); g.userData.yaw = true; haloColor = '#ffffff'; break;
    case 'missile': {
      const s2 = Math.max(r, .3) * 1.3, cyl = shared('cyl', () => new T.CylinderGeometry(.6, 1, 1, 6));
      add(cyl, basic('#eef1f6'), [s2 * .42, s2 * 2, s2 * .42], [0, 0, 0], [Math.PI / 2, 0, 0]); add(cyl, basic('#e8352b'), [s2 * .45, s2 * .4, s2 * .45], [0, 0, -s2 * .2], [Math.PI / 2, 0, 0]);
      add(cone(), basic('#e8352b'), [s2 * .42, s2 * .42, s2 * .5], [0, 0, s2 * 1.6], [Math.PI / 2, 0, 0]);
      for (let i = 0; i < 3; i++) { const a = i * Math.PI * 2 / 3; add(shared('box', () => new T.BoxGeometry(1, 1, 1)), basic('#3a7be8'), [s2 * .06, s2 * .6, s2 * .55], [Math.sin(a) * s2 * .5, Math.cos(a) * s2 * .5, -s2 * .8], [0, 0, -a]); }
      const fl = add(cone(), basic('#ffb02e', .9), [s2 * .4, s2 * .4, s2 * .9], [0, 0, -s2 * 1.9], [-Math.PI / 2, 0, 0]); noteAnim(g, fl, 'flick', s2 * .9, 0); add(cone(), basic('#fff1a8'), [s2 * .22, s2 * .22, s2 * .5], [0, 0, -s2 * 1.5], [-Math.PI / 2, 0, 0]);
      for (let i = 0; i < 3; i++) { const p = add(lowBall, basic('#d8dde6', .75), [1, 1, 1]); noteAnim(g, p, 'puff', i / 3, s2 * 3.2); }
      g.userData.yaw = true; haloColor = '#ffb347'; haloSize = 4; break; }
    case 'rock': {
      const stone=shared('rock',()=>{
        const geometry=new T.DodecahedronGeometry(1),positions=geometry.getAttribute('position'),colors=new Float32Array(positions.count*3),c=new T.Color();
        for(let i=0;i<positions.count;i+=3){let cx=0,cy=0,cz=0;for(let j=0;j<3;j++){cx+=positions.getX(i+j)/3;cy+=positions.getY(i+j)/3;cz+=positions.getZ(i+j)/3;}
          const crack=Math.abs(cx*.8+cy*.5-cz*.3)<.22||Math.abs(cy*.9-cz*.6+cx*.2)<.16;
          c.set(crack?'#4a2412':'#c96a3a').multiplyScalar(crack?1:.72+.28*((i/3*7)%11)/10);for(let j=0;j<3;j++)c.toArray(colors,(i+j)*3);}
        geometry.setAttribute('color',new T.BufferAttribute(colors,3));return geometry;
      });
      let material=mats.get('stone');if(!material)mats.set('stone',material=new T.MeshStandardMaterial({vertexColors:true,roughness:1,flatShading:true}));
      add(stone,material,[r,r*.85,r]);g.userData.spin3=true;haloSize=0;break;
    }
    case 'snow': { inked(r); add(ball, basic('#dcecff'), [r, r, r]); add(ball, basic('#ffffff'), [r * .85, r * .85, r * .85], [-r * .15, r * .2, r * .1]); for (let i = 0; i < 4; i++) { const a = i * 1.7; add(lowBall, basic(i % 2 ? '#ffffff' : '#cfe4fa'), [r * .32, r * .32, r * .32], [Math.cos(a) * r * .8, Math.sin(a * 1.3) * r * .7, Math.sin(a) * r * .5]); }
      kit.sparkle('#ffffff', r * 2.2, [r * .7, r * .8, r * .5], 0); haloColor = '#9fd8ff'; haloSize = 3.2; break; }
    case 'cork': { // a toy popgun cork: a tan stopper, wider at the back, a darker end and a little string tail
      const s2 = Math.max(r, .24), plug = shared('cork', () => new T.CylinderGeometry(.75, 1, 1, 10));
      add(plug, basic('#d9a866'), [s2, s2 * 1.5, s2], [0, 0, 0], [-Math.PI / 2, 0, 0]); add(shared('corkcap', () => new T.CircleGeometry(1, 10)), basic('#a8743e'), [s2 * .98, s2 * .98, 1], [0, 0, -s2 * .76], [0, Math.PI, 0]);
      add(shared('string', () => new T.CylinderGeometry(.5, .5, 1, 4)), basic('#fff4dc'), [s2 * .12, s2 * 2.2, s2 * .12], [0, 0, -s2 * 1.8], [Math.PI / 2, 0, 0]); kit.sparkle('#ffffff', s2 * 2.2, [s2 * .6, s2 * .6, 0], 0);
      g.userData.yaw = true; haloColor = '#ffd9a0'; haloSize = 3; break; }
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
  playAnims(g, time, x * 3 + z);
}
