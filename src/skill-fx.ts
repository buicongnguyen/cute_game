import * as T from 'three';
import { RibbonBatch } from './ribbons.ts';
import type { Effects } from './fx.ts';
import { GAZE, type CombatEffect } from './combat.ts';
import { part } from './part-cache.ts';
import { DisguiseFx } from './disguise-fx.ts';
import { BoulderFx } from './boulder-fx.ts';

/**
 * Skill visuals that need more than rings and sparks (lightweight-game-objects: pooled, two ribbon draws + one decal
 * draw in all, nothing allocated per frame):
 *  - the laser gaze (look 'eyes'): twin red beams from the explorer's eyes to the far end of the hit line, as wide as
 *    that line, the head turning with the sweep, sparks and scorch marks where the beams touch the ground;
 *  - laser hits (look 'burn'): a flash, sparks and a scorch on the creature's spot;
 *  - electric shots and bursts (look 'shock'): crackling bolts, a blue-white flash, branching arcs, and a ⚡ mark
 *    (`shock` seconds) on every creature inside the burst, which combat-view/hud read through statusMarks.
 * The combat simulation decides every hit; this only draws what an effect says, so remote players see the same.
 */
export interface ShockTarget { x: number; z: number; radius: number; hp: number; shock?: number }
export interface SkillFxHost {
  /** The explorer model (local or remote) standing within ~1.5 m of x,z, for its eyes; null when none. */
  explorerAt(x: number, z: number): T.Object3D | null;
  ground(x: number, z: number): number;
  targets(): readonly ShockTarget[];
  sound(kind: 'shock' | 'zap'): void;
  /** Particle density 0-1 of the graphics setting, and whether a cast at x,z is the local player's. */
  density?(): number;
  isLocal?(x: number, z: number): boolean;
}
/** Seconds a creature shows ⚡ after an electric hit. */
export const SHOCK_MARK = 1.1;
/** The eyes relative to the head pivot, in hero model units (art/blender/kit/build_hero.py EYE and hero_spec.py; +z is forward). */
export const EYE = { x: .21, y: .465, z: .55 } as const;
/** Each eye beam's width at the eye and at the far end; the two end widths and their spread together make GAZE.width. */
export const GAZE_BEAM = { start: .7, end: .7 } as const;
const GAZE_SPREAD = GAZE.width / 2 - GAZE_BEAM.end / 2;

const TAU = Math.PI * 2;
const rand = (a: number, b: number) => a + Math.random() * (b - a);
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

/** Where both eyes of `model` are now (world space); the model faces +z, so its left is +x. Falls back to the resting head without a head part. */
export function eyePoints(model: T.Object3D, left: T.Vector3, right: T.Vector3) {
  const head = part(model, 'head');
  if (head) { head.updateWorldMatrix(true, false); left.set(EYE.x, EYE.y, EYE.z).applyMatrix4(head.matrixWorld); right.set(-EYE.x, EYE.y, EYE.z).applyMatrix4(head.matrixWorld); return; }
  model.updateWorldMatrix(true, false); left.set(EYE.x, 1.12 + EYE.y, EYE.z).applyMatrix4(model.matrixWorld); right.set(-EYE.x, 1.12 + EYE.y, EYE.z).applyMatrix4(model.matrixWorld);
}
/**
 * The far ends of the two eye beams for a gaze from `origin` along `angle`: GAZE.length ahead on the ground, one either
 * side of the hit line's centre so the beams' outer edges meet the line's edges (GAZE.width). Written into `out`
 * as [leftX, leftZ, rightX, rightZ] (left = the explorer's left).
 */
export function gazeEnds(origin: { x: number; z: number }, angle: number, out: number[] | Float32Array) {
  const fx = Math.sin(angle), fz = Math.cos(angle), sx = Math.cos(angle), sz = -Math.sin(angle);
  const cx = origin.x + fx * GAZE.length, cz = origin.z + fz * GAZE.length;
  out[0] = cx + sx * GAZE_SPREAD; out[1] = cz + sz * GAZE_SPREAD; out[2] = cx - sx * GAZE_SPREAD; out[3] = cz - sz * GAZE_SPREAD;
  return out;
}

interface Gaze { band: T.Mesh; live: boolean; model: T.Object3D | null; x: number; z: number; angle: number; rate: number; seen: number; until: number; age: number; color: T.Color; scorch: { x: number; z: number } | null; spark: number }
interface Bolt { live: boolean; a: Float32Array; b: Float32Array; seg: Float32Array; n: number; forks: number; life: number; max: number; width: number; jag: number; branches: number; next: number; flicker: number }
interface Decal { live: boolean; x: number; y: number; z: number; r: number; age: number; life: number }

const MAX_SEG = 16, CRACKLE_QUEUE = 24;
const HOT = new T.Color('#ff7a2a'), BURNT = new T.Color('#2b1a14'), GLOW_BLUE = new T.Color('#2a8cff'), CORE_WHITE = new T.Color('#f4fdff');
const LASER_GLOW = new T.Color('#ff2a1c'), LASER_MID = new T.Color('#ff7350'), LASER_CORE = new T.Color('#fff4ec');

let bandTexture: T.Texture | null = null;
/** The hit line on the ground: crisp rims at its exact edges and a soft warm fill, so its width reads at a glance. */
function bandCard() {
  if (bandTexture) return bandTexture;
  const canvas = typeof document === 'undefined' ? null : document.createElement('canvas');
  if (!canvas) return (bandTexture = new T.Texture());
  canvas.width = 64; canvas.height = 4;
  const ctx = canvas.getContext('2d')!, g = ctx.createLinearGradient(0, 0, 64, 0);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(.06, 'rgba(255,255,255,.95)'); g.addColorStop(.09, 'rgba(255,255,255,.3)');
  g.addColorStop(.5, 'rgba(255,255,255,.5)'); g.addColorStop(.91, 'rgba(255,255,255,.3)'); g.addColorStop(.94, 'rgba(255,255,255,.95)'); g.addColorStop(1, 'rgba(255,255,255,1)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 4);
  return (bandTexture = new T.CanvasTexture(canvas));
}
let burnTexture: T.Texture | null = null;
function burnCard() {
  if (burnTexture) return burnTexture;
  const canvas = typeof document === 'undefined' ? null : document.createElement('canvas');
  if (!canvas) return (burnTexture = new T.Texture());
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext('2d')!, g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,.95)'); g.addColorStop(.45, 'rgba(255,255,255,.7)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 64);
  return (burnTexture = new T.CanvasTexture(canvas));
}

export class SkillFx {
  readonly disguises:DisguiseFx;
  readonly boulders:BoulderFx;
  readonly root = new T.Group();
  readonly glow = new RibbonBatch(1024, { renderOrder: 3 });
  readonly core = new RibbonBatch(768, { renderOrder: 4 });
  private bandShape = new T.PlaneGeometry(1, 1).rotateX(-Math.PI / 2).translate(0, 0, .5);
  /** Each gaze also lays its exact hit line on the ground: a faint red band GAZE.width wide and GAZE.length long. */
  private gazes: Gaze[] = Array.from({ length: 4 }, () => ({ band: this.makeBand(), live: false, model: null, x: 0, z: 0, angle: 0, rate: 0, seen: 0, until: 0, age: 0, color: new T.Color(), scorch: null, spark: 0 }));
  private bolts: Bolt[] = Array.from({ length: 64 }, () => ({ live: false, a: new Float32Array(3), b: new Float32Array(3), seg: new Float32Array(MAX_SEG * 6), n: 0, forks: 0, life: 0, max: 1, width: .1, jag: .2, branches: 0, next: 0, flicker: 1 }));
  private decals: Decal[] = Array.from({ length: 96 }, () => ({ live: false, x: 0, y: 0, z: 0, r: .4, age: 0, life: 2 }));
  private decalMesh: T.InstancedMesh;
  private crackles = new Float32Array(CRACKLE_QUEUE * 5); private crackleCount = 0;
  private shocked = new Set<ShockTarget>();
  private time = 0; private lastSound = -1; private fx: Effects | null; private host: SkillFxHost; private scene: T.Scene;
  private eyeL = new T.Vector3(); private eyeR = new T.Vector3(); private ends = new Float32Array(4); private origin = { x: 0, z: 0 };
  private m = new T.Matrix4(); private q = new T.Quaternion(); private s = new T.Vector3(); private p = new T.Vector3(); private c = new T.Color();
  private u = new T.Vector3(); private v = new T.Vector3(); private d = new T.Vector3();

  constructor(scene: T.Scene, fx: Effects | null, host: SkillFxHost) {
    this.disguises=new DisguiseFx(host);this.root.add(this.disguises.root);this.boulders=new BoulderFx(host);this.root.add(this.boulders.root);
    this.scene = scene; this.fx = fx; this.host = host;
    this.root.name = 'skill-fx';
    const decal = new T.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    this.decalMesh = new T.InstancedMesh(decal, new T.MeshBasicMaterial({ map: burnCard(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }), this.decals.length);
    this.decalMesh.instanceMatrix.setUsage(T.DynamicDrawUsage); this.decalMesh.setColorAt(0, BURNT); this.decalMesh.instanceColor!.setUsage(T.DynamicDrawUsage);
    this.decalMesh.count = 0; this.decalMesh.frustumCulled = false; this.decalMesh.renderOrder = 1; this.decalMesh.name = 'scorch';
    this.root.add(this.decalMesh, this.glow.mesh, this.core.mesh);
    scene.add(this.root);
  }
  setEffects(fx: Effects | null) { this.fx = fx; }
  private makeBand() {
    const band = new T.Mesh(this.bandShape, new T.MeshBasicMaterial({ color: '#ff3a1a', map: bandCard(), transparent: true, opacity: .2, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1 }));
    band.visible = false; band.renderOrder = 1; band.scale.set(GAZE.width, 1, GAZE.length); band.name = 'gaze-band'; this.root.add(band); return band;
  }

  /** True while anything is drawn (tests and the idle early-out). */
  get busy() { return this.disguises.busy || this.boulders.busy || this.gazes.some(g => g.live) || this.bolts.some(b => b.live) || this.decals.some(d => d.live) || this.crackleCount > 0 || this.shocked.size > 0; }
  get liveBolts() { return this.bolts.reduce((n, b) => n + (b.live ? 1 : 0), 0); }
  get liveDecals() { return this.decals.reduce((n, d) => n + (d.live ? 1 : 0), 0); }

  /** A beam with look 'eyes': start or steer the gaze of the explorer standing at the effect's origin. */
  gaze(e: CombatEffect) {
    let g = this.gazes.find(x => x.live && Math.hypot(x.x - e.x, x.z - e.z) < 1.5);
    if (!g) {
      g = this.gazes.find(x => !x.live) ?? this.gazes.reduce((a, b) => a.until < b.until ? a : b);
      Object.assign(g, { live: true, model: this.host.explorerAt(e.x, e.z), angle: e.facing ?? 0, rate: 0, seen: this.time, age: 0, scorch: null, spark: 0 });
      this.host.sound('zap');
    } else {
      const gap = this.time - g.seen;
      if (gap > .004) g.rate = Math.max(-4, Math.min(4, wrap((e.facing ?? 0) - g.angle) / gap));
      g.angle = e.facing ?? 0; g.seen = this.time;
    }
    g.x = e.x; g.z = e.z; g.until = this.time + (e.duration ?? .08); g.color.set(e.color);
  }
  /** The facing of the gaze `model` is casting now (its head turns with it), or null. */
  gazeAngle(model: T.Object3D) { const g = this.gazes.find(x => x.live && x.model === model); return g ? g.angle + g.rate * Math.min(.05, this.time - g.seen) : null; }

  /** A laser hit (look 'burn'): a hot flash, sparks, and a scorch on the ground. */
  burn(e: CombatEffect) {
    const y = this.host.ground(e.x, e.z);
    this.fx?.flash({ x: e.x, y: y + .7, z: e.z }, '#ff9a5a', 1.3, .12);
    this.fx?.burst({ x: e.x, y, z: e.z }, { n: 9, color: ['#ffffff', '#ffd27a', '#ff6a3a'], glow: true, size: .08, speed: 4.5, up: 4, life: .45, y: .6, gravity: 9 });
    this.fx?.burst({ x: e.x, y, z: e.z }, { n: 3, color: ['#4a3a34', '#6a5a52'], size: .12, speed: 1, up: 2.5, life: .7, y: .3, gravity: -1 });
    this.decal(e.x, y, e.z, .5, 2.4);
  }

  /** An electric burst (look 'shock') of `e.radius`: flash, branching arcs, sparks, a ring, ⚡ on every creature inside (`mark`). */
  shock(e: CombatEffect, strong = e.radius >= 1.5, mark = true) {
    const y = this.host.ground(e.x, e.z), r = Math.max(.6, e.radius), size = strong ? 1 : .6;
    this.fx?.flash({ x: e.x, y: y + .8, z: e.z }, '#ffffff', 1.4 * size + .4, .09);
    this.fx?.flash({ x: e.x, y: y + .8, z: e.z }, '#5fbfff', 2.6 * size + .6, .2);
    this.fx?.burst({ x: e.x, y, z: e.z }, { n: strong ? 12 : 6, color: ['#ffffff', '#bfefff', '#5fbfff'], glow: true, size: .08, speed: 5 + r, up: 3, life: .35, y: .6, gravity: 5 });
    if (strong) this.fx?.ring({ x: e.x, z: e.z }, { color: '#9fe6ff', from: .3, to: r, life: .28, y: y + .12, thick: .12, opacity: .9 });
    const count = strong ? 6 : 3;
    for (let i = 0; i < count; i++) {
      const a = (i + Math.random() * .7) / count * TAU, d = r * rand(.55, 1);
      this.bolt(e.x, y + rand(.7, 1), e.z, e.x + Math.sin(a) * d, y + rand(.05, .8), e.z + Math.cos(a) * d, { life: rand(.2, .32), width: strong ? .14 : .1, branches: strong ? 2 : 1 });
    }
    if (mark) for (const t of this.host.targets()) if (t.hp > 0 && Math.hypot(t.x - e.x, t.z - e.z) <= r + t.radius) { t.shock = Math.max(t.shock ?? 0, SHOCK_MARK); this.shocked.add(t); }
    if (this.time - this.lastSound > .09) { this.lastSound = this.time; this.host.sound('shock'); }
  }

  /** A crackling lightning bolt from a to b (re-jagged 30 times a second), with small forks. */
  bolt(ax: number, ay: number, az: number, bx: number, by: number, bz: number, { life = .2, width = .1, jag = .16, branches = 1 } = {}) {
    const b = this.bolts.find(x => !x.live) ?? this.bolts.reduce((p, q) => p.life < q.life ? p : q);
    b.live = true; b.a[0] = ax; b.a[1] = ay; b.a[2] = az; b.b[0] = bx; b.b[1] = by; b.b[2] = bz;
    b.life = b.max = life; b.width = width; b.jag = jag; b.branches = branches; b.next = 0;
    return b;
  }

  /** A flying electric shot at x,y,z heading dx,dz: drawn this frame as a glowing streak with a crackle. */
  crackle(x: number, y: number, z: number, dx: number, dz: number) {
    if (this.crackleCount >= CRACKLE_QUEUE) return;
    const i = this.crackleCount++ * 5; this.crackles[i] = x; this.crackles[i + 1] = y; this.crackles[i + 2] = z; this.crackles[i + 3] = dx; this.crackles[i + 4] = dz;
  }

  private decal(x: number, y: number, z: number, r: number, life: number) {
    const d = this.decals.find(x => !x.live) ?? this.decals.reduce((a, b) => a.life - a.age < b.life - b.age ? a : b);
    d.live = true; d.x = x; d.y = y + .03; d.z = z; d.r = r; d.age = 0; d.life = life;
  }

  update(dt: number) {
    if (this.root.parent !== this.scene) this.scene.add(this.root);
    this.time += dt;
    this.glow.clear(); this.core.clear();
    if (this.busy) { this.drawGazes(dt); this.drawBolts(dt); this.drawCrackles(); this.drawShocked(dt); this.drawDecals(dt); }
    this.glow.commit(); this.core.commit();
  }

  private drawGazes(dt: number) {
    for (const g of this.gazes) {
      if (!g.live) continue;
      g.age += dt;
      const fade = Math.min(1, g.age / .06) * Math.min(1, Math.max(0, (g.until + .12 - this.time) / .12));
      if (fade <= 0) { g.live = false; g.band.visible = false; continue; }
      const model = g.model && g.model.parent ? g.model : null;
      const angle = g.angle + g.rate * Math.min(.05, this.time - g.seen), ox = model ? model.position.x : g.x, oz = model ? model.position.z : g.z;
      if (model) eyePoints(model, this.eyeL, this.eyeR);
      else { const sx = Math.cos(angle) * .18, sz = -Math.sin(angle) * .18, fx = Math.sin(angle) * .46, fz = Math.cos(angle) * .46, y = this.host.ground(ox, oz) + 1.33; this.eyeL.set(ox + fx + sx, y, oz + fz + sz); this.eyeR.set(ox + fx - sx, y, oz + fz - sz); }
      this.origin.x = ox; this.origin.z = oz; gazeEnds(this.origin, angle, this.ends);
      const fx = Math.sin(angle), fz = Math.cos(angle), cx = ox + fx * GAZE.length, cz = oz + fz * GAZE.length, gy = this.host.ground(cx, cz) + .06;
      const pulse = fade * (.88 + .12 * Math.sin(this.time * 63)), wob = 1 + .07 * Math.sin(this.time * 47);
      g.band.visible = true; g.band.position.set(ox, Math.max(this.host.ground(ox, oz), gy - .06) + .05, oz); g.band.rotation.y = angle; (g.band.material as T.MeshBasicMaterial).opacity = .55 * fade;
      // Left eye → left end, right eye → right end: three layers each (red glow, orange body, white-hot core).
      for (let k = 0; k < 2; k++) {
        const eye = k ? this.eyeR : this.eyeL, ex = this.ends[k * 2], ez = this.ends[k * 2 + 1];
        this.glow.add(eye.x, eye.y, eye.z, ex, gy, ez, GAZE_BEAM.start * wob, GAZE_BEAM.end * wob, LASER_GLOW, .9 * pulse, 0);
        this.glow.add(eye.x, eye.y, eye.z, ex, gy, ez, GAZE_BEAM.start * .52, GAZE_BEAM.end * .52, LASER_MID, pulse, .6);
        this.core.add(eye.x, eye.y, eye.z, ex, gy, ez, .18, .22, LASER_CORE, pulse, 1);
        // The eye itself blazes.
        this.glow.add(eye.x - fx * .12, eye.y, eye.z - fz * .12, eye.x + fx * .18, eye.y, eye.z + fz * .18, .34, .3, LASER_MID, pulse, 0);
        this.core.add(eye.x - fx * .05, eye.y, eye.z - fz * .05, eye.x + fx * .08, eye.y, eye.z + fz * .08, .13, .11, LASER_CORE, pulse, 1);
      }
      // Where the beams meet the ground: a hot spot, sparks, and a scorched trail along the sweep.
      this.glow.add(cx - fx * .55, gy, cz - fz * .55, cx + fx * .3, gy, cz + fz * .3, GAZE.width * 1.1, GAZE.width * .9, LASER_GLOW, .55 * pulse, 0);
      this.core.add(cx - fx * .3, gy, cz - fz * .3, cx + fx * .15, gy, cz + fz * .15, .35, .3, LASER_CORE, .8 * pulse, .8);
      g.spark -= dt;
      if (g.spark <= 0 && fade > .5) { g.spark = .05; this.fx?.burst({ x: cx, y: gy, z: cz }, { n: 2, color: ['#ffffff', '#ffd27a', '#ff6a3a'], glow: true, size: .08, speed: 3.5, up: 3.5, life: .4, y: .05, gravity: 9 }); }
      if (!g.scorch || Math.hypot(g.scorch.x - cx, g.scorch.z - cz) > .45) { this.decal(cx, gy - .06, cz, .42, 2.2); g.scorch = g.scorch ?? { x: 0, z: 0 }; g.scorch.x = cx; g.scorch.z = cz; }
    }
  }

  private forkAt = new Int8Array(4);
  private segment(b: Bolt, i: number, ax: number, ay: number, az: number, bx: number, by: number, bz: number) { const o = i * 6, s = b.seg; s[o] = ax; s[o + 1] = ay; s[o + 2] = az; s[o + 3] = bx; s[o + 4] = by; s[o + 5] = bz; }
  private jag(b: Bolt) {
    const ax = b.a[0], ay = b.a[1], az = b.a[2], d = this.d.set(b.b[0] - ax, b.b[1] - ay, b.b[2] - az), length = d.length() || 1;
    d.multiplyScalar(1 / length);
    this.u.set(0, 1, 0).cross(d); if (this.u.lengthSq() < 1e-4) this.u.set(1, 0, 0); this.u.normalize(); this.v.copy(d).cross(this.u);
    const points = Math.max(3, Math.min(9, Math.round(length / .32) + 2)), amp = b.jag * Math.min(1.4, length);
    let n = 0, forks = 0, px = ax, py = ay, pz = az;
    for (let i = 1; i < points; i++) {
      const s = i / (points - 1), taper = i === points - 1 ? 0 : Math.sin(s * Math.PI), ou = rand(-1, 1) * amp * taper, ov = rand(-1, 1) * amp * taper;
      const x = ax + d.x * length * s + this.u.x * ou + this.v.x * ov, y = ay + d.y * length * s + this.u.y * ou + this.v.y * ov, z = az + d.z * length * s + this.u.z * ou + this.v.z * ov;
      this.segment(b, n++, px, py, pz, x, y, z); px = x; py = y; pz = z;
      if (i < points - 1 && forks < b.branches && Math.random() < .45) this.forkAt[forks++] = n - 1;
    }
    // Forks: a short two-step zigzag leaving a joint at up to 50° from the main bolt.
    for (let f = 0; f < forks && n + 2 <= MAX_SEG; f++) {
      const k = this.forkAt[f], reach = length * rand(.18, .32);
      let bx = b.seg[k * 6 + 3], by = b.seg[k * 6 + 4], bz = b.seg[k * 6 + 5];
      for (let step = 0; step < 2; step++) {
        const turn = rand(-.9, .9), x = bx + (d.x + this.u.x * turn) * reach * .5 + this.v.x * rand(-.3, .3) * reach, y = by + (d.y + this.u.y * turn) * reach * .5 + rand(-.15, .1), z = bz + (d.z + this.u.z * turn) * reach * .5 + this.v.z * rand(-.3, .3) * reach;
        this.segment(b, n++, bx, by, bz, x, y, z); bx = x; by = y; bz = z;
      }
    }
    b.n = n; b.forks = n - (points - 1); b.flicker = rand(.65, 1);
  }

  private drawBolts(dt: number) {
    for (const b of this.bolts) {
      if (!b.live) continue;
      b.life -= dt; if (b.life <= 0) { b.live = false; continue; }
      b.next -= dt; if (b.next <= 0) { b.next = 1 / 30; this.jag(b); }
      const k = Math.sqrt(b.life / b.max) * b.flicker;
      for (let i = 0; i < b.n; i++) {
        const o = i * 6, w = b.width * (i < b.n - b.forks ? 1 : .6);
        this.glow.add(b.seg[o], b.seg[o + 1], b.seg[o + 2], b.seg[o + 3], b.seg[o + 4], b.seg[o + 5], w * 3.6, w * 3.6, GLOW_BLUE, .8 * k, 0);
        this.core.add(b.seg[o], b.seg[o + 1], b.seg[o + 2], b.seg[o + 3], b.seg[o + 4], b.seg[o + 5], w, w, CORE_WHITE, k, 1);
      }
    }
  }

  private drawCrackles() {
    for (let i = 0; i < this.crackleCount; i++) {
      const o = i * 5, x = this.crackles[o], y = this.crackles[o + 1], z = this.crackles[o + 2], dx = this.crackles[o + 3], dz = this.crackles[o + 4];
      // A streak behind the shot (wide at the head), and a few jagged sparks jumping off it.
      this.glow.add(x - dx * .9, y, z - dz * .9, x, y, z, .06, .42, GLOW_BLUE, .75, 0);
      this.core.add(x - dx * .6, y, z - dz * .6, x, y, z, .02, .12, CORE_WHITE, .95, 1);
      for (let j = 0; j < 2; j++) {
        const a = Math.random() * TAU, r = rand(.2, .38), mx = x + Math.cos(a) * r * .5 + rand(-.08, .08), my = y + rand(-.15, .15), mz = z + Math.sin(a) * r * .5 + rand(-.08, .08);
        const ex = x + Math.cos(a + rand(-.6, .6)) * r, ey = y + rand(-.25, .25), ez = z + Math.sin(a + rand(-.6, .6)) * r;
        this.core.add(x, y, z, mx, my, mz, .035, .03, CORE_WHITE, .9, 1); this.core.add(mx, my, mz, ex, ey, ez, .03, .02, CORE_WHITE, .8, 1);
        this.glow.add(x, y, z, ex, ey, ez, .12, .08, GLOW_BLUE, .45, 0);
      }
    }
    this.crackleCount = 0;
  }

  /** Shocked creatures count their ⚡ down and twitch with a small spark now and then. */
  private drawShocked(dt: number) {
    for (const t of this.shocked) {
      t.shock = Math.max(0, (t.shock ?? 0) - dt);
      if (t.shock <= 0 || t.hp <= 0) { t.shock = 0; this.shocked.delete(t); continue; }
      if (Math.random() < dt * 7) {
        const y = this.host.ground(t.x, t.z), a = Math.random() * TAU, r = t.radius * rand(.4, .9), h = rand(.4, 1.2);
        this.bolt(t.x + Math.cos(a) * r, y + h, t.z + Math.sin(a) * r, t.x + Math.cos(a + 1.6) * r, y + h + rand(-.3, .3), t.z + Math.sin(a + 1.6) * r, { life: .09, width: .05, jag: .25, branches: 0 });
      }
    }
  }

  private drawDecals(dt: number) {
    let n = 0;
    for (const d of this.decals) {
      if (!d.live) continue;
      d.age += dt; if (d.age >= d.life) { d.live = false; continue; }
      const cool = Math.min(1, d.age / .4), shrink = d.age > d.life * .7 ? 1 - (d.age - d.life * .7) / (d.life * .3) : 1, r = d.r * (.8 + .2 * cool) * shrink * 2;
      this.decalMesh.setMatrixAt(n, this.m.compose(this.p.set(d.x, d.y, d.z), this.q.identity(), this.s.set(r, 1, r)));
      this.decalMesh.setColorAt(n, this.c.copy(HOT).lerp(BURNT, cool)); n++;
    }
    this.decalMesh.count = n;
    if (n) { this.decalMesh.instanceMatrix.needsUpdate = true; this.decalMesh.instanceColor!.needsUpdate = true; }
  }

  clear() {
    this.disguises.clear();this.boulders.clear();
    for (const g of this.gazes) { g.live = false; g.band.visible = false; } for (const b of this.bolts) b.live = false; for (const d of this.decals) d.live = false;
    for (const t of this.shocked) t.shock = 0; this.shocked.clear(); this.crackleCount = 0; this.decalMesh.count = 0;
    this.glow.clear(); this.core.clear(); this.glow.commit(); this.core.commit();
  }
}
