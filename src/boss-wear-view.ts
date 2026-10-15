import * as T from 'three';
import { toonMaterial } from './toon.ts';
import type { Effects } from './fx.ts';
import { ENRAGE_PUFF, SWEAT_GAP, WEAR_CHIP_STAGES, WEAR_COLORS, WEAR_PIECES, wearLook, wearStage, type WearShape } from './boss-wear.ts';

/**
 * Draws boss wear (boss-wear.ts) and the dizzy stars of a break (boss-stagger.ts). Three instanced batches (round bits:
 * bumps and sweat drops; flat bits: plasters and chips; stars), each made once with one shared-look toon material and
 * per-instance colours, hidden (no draw call) while empty: a world without a hurt boss draws exactly what it drew before.
 * world.ts readyTrail shows them for the start-up shader warm-up, so the first plaster never waits for its program
 * (FIX-PLAN 1.1: a mid-fight shader build was a freeze). Nothing is allocated per frame.
 *
 * A stuck-on piece is placed once, when its stage starts, on the boss's real surface (a ray against its model) and kept in
 * the model's own space, so it rides every step, tilt and squash of the drawn body.
 */
export interface WearBoss {
  id: string; type?: string; hp: number; maxHp: number; enraged?: boolean; mesh: T.Object3D;
  definition?: { color: string; accent: string };
}
interface Stuck { shape: 'blob' | 'flat'; local: T.Matrix4; color: T.Color }
interface Loose { shape: 'blob' | 'flat'; x: number; y: number; z: number; vx: number; vy: number; vz: number; spin: number; age: number; life: number; floor: number; size: number; color: T.Color; bounces: number }
interface Track { boss: WearBoss; stage: number; stuck: Stuck[]; height: number; half: number; sweat: number; puff: number; seen: boolean }

const CAP = { blob: 32, flat: 32, star: 12 } as const;
const m1 = new T.Matrix4(), m2 = new T.Matrix4(), inv = new T.Matrix4(), q = new T.Quaternion(), q2 = new T.Quaternion(), v1 = new T.Vector3(), v2 = new T.Vector3(), v3 = new T.Vector3(), s1 = new T.Vector3();
const Z = new T.Vector3(0, 0, 1), box = new T.Box3(), ray = new T.Raycaster(), hits: T.Intersection[] = [];
const PIECE: Readonly<Record<WearShape, { shape: 'blob' | 'flat'; size: [number, number, number]; color: string }>> = {
  bump: { shape: 'blob', size: [.26, .26, .17], color: WEAR_COLORS.bump },
  plaster: { shape: 'flat', size: [.62, .2, .05], color: WEAR_COLORS.plaster },
  cross: { shape: 'flat', size: [.62, .2, .05], color: WEAR_COLORS.plaster },
};
/** Most bosses tracked at once (the nearest), loose bits in flight. */
const MAX_BOSSES = 3, MAX_LOOSE = 24;

export class BossWearView {
  readonly group = new T.Group();
  private blob: T.InstancedMesh; private flat: T.InstancedMesh; private star: T.InstancedMesh;
  private tracks = new Map<string, Track>();
  private loose: Loose[] = [];
  /** Counts for tests and the probe. */
  stats = { stuck: 0, chips: 0, puffs: 0, stars: 0 };
  constructor() {
    const make = (g: T.BufferGeometry, cap: number, name: string) => {
      const m = new T.InstancedMesh(g, toonMaterial({ color: '#ffffff' }), cap); m.name = name;
      m.instanceMatrix.setUsage(T.DynamicDrawUsage); m.setColorAt(0, new T.Color('#ffffff')); m.count = 0; m.visible = false; m.frustumCulled = false; m.castShadow = m.receiveShadow = false;
      this.group.add(m); return m;
    };
    this.blob = make(new T.SphereGeometry(1, 8, 6), CAP.blob, 'boss-wear-round');
    this.flat = make(new T.BoxGeometry(1, 1, 1), CAP.flat, 'boss-wear-flat');
    this.star = make(new T.OctahedronGeometry(1, 0), CAP.star, 'boss-wear-stars');
    this.group.name = 'boss-wear'; this.group.matrixAutoUpdate = false;
  }
  /** For the shader warm-up: every batch visible with one instance far below the ground (`on`), or back to normal. */
  warm(on: boolean) {
    for (const m of [this.blob, this.flat, this.star]) { if (on) { m.setMatrixAt(0, m1.makeTranslation(0, -500, 0)); m.count = 1; m.visible = true; m.instanceMatrix.needsUpdate = true; } else { m.count = 0; m.visible = false; } }
  }
  /** Something is on show or in flight (the caller keeps calling frame until it is not). */
  get busy() { return this.loose.length > 0 || this.blob.visible || this.flat.visible || this.star.visible; }
  clear() { this.tracks.clear(); this.loose.length = 0; this.warm(false); }

  /**
   * Every drawn frame, after the scene's matrices are fresh. `bosses`: the bosses near the view (nearest first);
   * `broken(id)`: seconds left on its knees (0 when standing); `fx` for steam, sparks and dust; `dt` seconds.
   */
  frame(bosses: readonly WearBoss[], broken: (b: WearBoss) => number, fx: Effects | null, dt: number, now: number) {
    for (const t of this.tracks.values()) t.seen = false;
    let n = 0;
    for (const b of bosses) {
      if (n >= MAX_BOSSES) break; n++;
      let t = this.tracks.get(b.id); if (!t) { t = { boss: b, stage: 0, stuck: [], height: 0, half: 0, sweat: 0, puff: ENRAGE_PUFF * .5, seen: true }; this.tracks.set(b.id, t); }
      t.boss = b; t.seen = true; if (b.mesh.visible) this.measure(t);
      const stage = b.mesh.visible ? wearStage(b.hp, b.maxHp) : 0;
      if (stage < t.stage) { t.stuck.length = 0; t.stage = 0; }
      if (stage > t.stage) { this.measure(t); for (let s = t.stage + 1; s <= stage; s++) this.addStage(t, s, fx, s === stage); t.stage = stage; }
      if (!b.mesh.visible) continue;
      // Sweat flies off the brow at stage 2 and faster at 3; an enraged boss puffs now and then.
      const gap = SWEAT_GAP[t.stage]; if (Number.isFinite(gap)) { t.sweat -= dt; if (t.sweat <= 0) { t.sweat = gap * (.75 + Math.random() * .5); this.sweat(t); } }
      if (b.enraged && fx) { t.puff -= dt; if (t.puff <= 0) { t.puff = ENRAGE_PUFF * (.7 + Math.random() * .6); this.puff(t, fx); } }
    }
    for (const [id, t] of this.tracks) if (!t.seen) this.tracks.delete(id);
    this.draw(broken, dt, now);
  }

  /** Model height and half-width in the model's own space, once per boss (and again when its art changes). */
  private measure(t: Track) {
    const mesh = t.boss.mesh, k = Math.max(.001, mesh.scale.x), asset = mesh.userData.refinedAsset ?? mesh.userData.creatureArt;
    if (t.height && mesh.userData.wearAsset === asset) return;
    box.setFromObject(mesh); mesh.userData.wearAsset = asset;
    t.height = Number.isFinite(box.max.y) ? Math.max(.6, (box.max.y - mesh.position.y) / k) : 2.2; t.half = Number.isFinite(box.max.x) ? Math.max(.3, Math.min(box.max.x - box.min.x, box.max.z - box.min.z) / 2 / k) : .8;
  }
  /**
   * A point on the model's surface in its own space, `angle` round from the side facing the camera (the game's camera
   * looks from +z: a new piece appears where it is seen) at `share` of its height (a ray from outside).
   */
  private surface(t: Track, angle: number, share: number, outPoint: T.Vector3, outNormal: T.Vector3) {
    const mesh = t.boss.mesh, h = t.height * share, a = angle - mesh.rotation.y, dx = Math.sin(a), dz = Math.cos(a);
    mesh.updateWorldMatrix(true, true);
    for (const tilt of [0, .9]) { // level first, then from above (a narrow head)
      v1.set(dx * (t.half * 3 + 1), h + tilt * t.height, dz * (t.half * 3 + 1)).applyMatrix4(mesh.matrixWorld);
      v2.set(0, h * (1 - tilt * .12), 0).applyMatrix4(mesh.matrixWorld).sub(v1).normalize();
      ray.set(v1, v2); hits.length = 0; ray.intersectObject(mesh, true, hits);
      const hit = hits.find(i => (i.object as T.Mesh).isMesh && !i.object.userData.outline && i.object.visible && i.object.name !== 'attack-telegraph');
      if (!hit) continue;
      inv.copy(mesh.matrixWorld).invert(); outPoint.copy(hit.point).applyMatrix4(inv);
      if (hit.face) { outNormal.copy(hit.face.normal).transformDirection(hit.object.matrixWorld).transformDirection(inv); } else outNormal.set(dx, 0, dz);
      if (outNormal.lengthSq() < 1e-6) outNormal.set(dx, 0, dz);
      return;
    }
    outPoint.set(dx * t.half * .8, h, dz * t.half * .8); outNormal.set(dx, 0, dz);
  }
  private addStage(t: Track, stage: number, fx: Effects | null, newest: boolean) {
    const k = Math.max(.001, t.boss.mesh.scale.x);
    for (const [s, shape, angle, share] of WEAR_PIECES) {
      if (s !== stage) continue;
      const p = PIECE[shape]; this.surface(t, angle, share, v1, v2); v2.normalize();
      // Faces outwards along the surface normal, a little tilted at random, sitting just proud of the skin.
      q.setFromUnitVectors(Z, v2);
      for (const roll of shape === 'cross' ? [.78, -.78] : [(Math.random() - .5) * .9]) {
        q2.setFromAxisAngle(Z, roll); const rot = q.clone().multiply(q2);
        v3.copy(v1).addScaledVector(v2, p.size[2] * .35 / k); s1.set(p.size[0] / k, p.size[1] / k, p.size[2] / k);
        t.stuck.push({ shape: p.shape, local: new T.Matrix4().compose(v3, rot, s1), color: new T.Color(p.color) }); this.stats.stuck++;
      }
    }
    if (newest && WEAR_CHIP_STAGES.has(stage)) this.chip(t, stage, fx);
  }
  /** A chip of the boss pops off its side and bounces away (with a puff of dust where it leaves). */
  private chip(t: Track, stage: number, fx: Effects | null) {
    const b = t.boss, look = wearLook(b.type, b.definition?.color ?? '#ffffff', b.definition?.accent ?? '#ffffff'), color = look.chips[stage >= 3 ? 1 : 0];
    this.surface(t, stage >= 3 ? -1.1 : 1.2, stage >= 3 ? .78 : .55, v1, v2); v1.applyMatrix4(b.mesh.matrixWorld); v2.transformDirection(b.mesh.matrixWorld);
    v2.y = Math.max(.2, v2.y); v2.normalize();
    this.launch('flat', v1, v2.x * 3.2, 4.5 + Math.random() * 1.5, v2.z * 3.2, .26, color, b.mesh.position.y);
    this.launch('flat', v1, v2.x * 2.2 + .8, 3.6, v2.z * 2.2 - .6, .15, color, b.mesh.position.y);
    fx?.burst({ x: v1.x, y: v1.y, z: v1.z }, { n: 8, color: [color, '#ffffff'], size: .1, speed: 3, up: 2.5, y: 0, life: .45 });
    this.stats.chips++;
  }
  private sweat(t: Track) {
    const b = t.boss, side = Math.random() < .5 ? -1 : 1;
    this.surface(t, side * (.7 + Math.random() * .5), .86, v1, v2); v1.applyMatrix4(b.mesh.matrixWorld); v2.transformDirection(b.mesh.matrixWorld).normalize();
    this.launch('blob', v1, v2.x * 1.6, 2.4, v2.z * 1.6, .075, WEAR_COLORS.sweat, b.mesh.position.y, .7);
  }
  private puff(t: Track, fx: Effects) {
    const b = t.boss, m = b.mesh, top = m.position.y + t.height * m.scale.y * .95, hot = wearLook(b.type, '#fff', '#fff').puff === 'sparks';
    fx.burst({ x: m.position.x, y: top, z: m.position.z }, hot
      ? { n: 6, color: ['#ffe066', '#ff9a3d', '#ffffff'], glow: true, size: .1, speed: 3, up: 3, y: 0, life: .4 }
      : { n: 5, color: ['#ffffff', '#eef4ff', '#dfe8f0'], size: .2, speed: 1.2, up: 2.2, y: 0, life: .9, gravity: -2 });
    this.stats.puffs++;
  }
  private launch(shape: 'blob' | 'flat', at: T.Vector3, vx: number, vy: number, vz: number, size: number, color: string, floor: number, life = 3.2) {
    if (this.loose.length >= MAX_LOOSE) this.loose.shift();
    this.loose.push({ shape, x: at.x, y: at.y, z: at.z, vx, vy, vz, spin: (Math.random() - .5) * 14, age: 0, life, floor: floor + size * .5, size, color: new T.Color(color), bounces: 0 });
  }

  private draw(broken: (b: WearBoss) => number, dt: number, now: number) {
    let nb = 0, nf = 0, ns = 0;
    const put = (shape: 'blob' | 'flat', m: T.Matrix4, c: T.Color) => {
      if (shape === 'blob') { if (nb < CAP.blob) { this.blob.setMatrixAt(nb, m); this.blob.setColorAt(nb++, c); } }
      else if (nf < CAP.flat) { this.flat.setMatrixAt(nf, m); this.flat.setColorAt(nf++, c); }
    };
    for (const t of this.tracks.values()) {
      const mesh = t.boss.mesh; if (!mesh.visible) continue;
      for (const s of t.stuck) put(s.shape, m2.multiplyMatrices(mesh.matrixWorld, s.local), s.color);
      // Dizzy stars: four circle the head while the boss is on its knees.
      const left = broken(t.boss);
      if (left > 0) {
        const k = mesh.scale.x, top = mesh.position.y + t.height * mesh.scale.y + .25, r = Math.max(.5, t.half * k * .55);
        for (let i = 0; i < 4 && ns < CAP.star; i++) {
          const a = now * 3.2 + i * Math.PI / 2, pop = Math.min(1, left * 4);
          v1.set(mesh.position.x + Math.cos(a) * r, top + Math.sin(a * 2 + i) * .08, mesh.position.z + Math.sin(a) * r);
          q.setFromAxisAngle(Z, now * 6 + i); s1.set(.15 * pop, .15 * pop, .07 * pop);
          this.star.setMatrixAt(ns, m1.compose(v1, q, s1)); this.star.setColorAt(ns++, starColor);
        }
        this.stats.stars = ns;
      }
    }
    // Loose bits: chips bounce twice and lie still a moment, sweat drops arc and shrink away.
    let kept = 0;
    for (const p of this.loose) {
      p.age += dt; if (p.age >= p.life) continue;
      p.vy -= 16 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      if (p.y < p.floor) { p.y = p.floor; if (p.shape === 'blob') p.age = p.life; else if (p.bounces < 2 && p.vy < -1) { p.vy *= -.42; p.vx *= .55; p.vz *= .55; p.spin *= .5; p.bounces++; } else { p.vy = p.vx = p.vz = 0; p.spin = 0; } }
      this.loose[kept++] = p; if (p.age >= p.life) continue;
      const fade = Math.min(1, (p.life - p.age) / .35), sz = p.size * fade, spin = p.spin * p.age;
      v1.set(p.x, p.y, p.z); q.setFromAxisAngle(v2.set(.6, .3, .74).normalize(), spin);
      s1.set(sz, p.shape === 'blob' ? sz * 1.4 : sz * .55, sz); put(p.shape, m1.compose(v1, q, s1), p.color);
    }
    this.loose.length = kept;
    const set = (m: T.InstancedMesh, count: number) => { m.count = count; m.visible = count > 0; if (count) { m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; } };
    set(this.blob, nb); set(this.flat, nf); set(this.star, ns);
  }
}
const starColor = new T.Color(WEAR_COLORS.star);
