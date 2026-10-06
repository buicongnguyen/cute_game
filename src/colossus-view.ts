import * as T from 'three';
import { TelegraphDecals } from './telegraph.ts';
import { COLOSSUS_ACTIVE, COLOSSUS_COLORS, colossusFeet, forwardOf, sweepAngle, type ColossusAttack } from './colossus-patterns.ts';
import { COLOSSUS_STATS } from './colossus-content.ts';

const SAFE = '#5aff9a', BREATH = 30, SWEEP = 26.5, SWEEP_ARC = 2.4;
/**
 * Everything the Colossus's attacks put on the ground, drawn from the shared attack state each frame (offline and online
 * alike): filling danger discs, the roar's green safe spots at its feet, the fire-breath lane and stream, the sweeping
 * arm's fan, falling ash meteors and glowing lava footprints. All meshes are pooled; nothing is made mid-fight.
 */
export class ColossusAttackView {
  readonly root = new T.Group();
  private decals = new TelegraphDecals();
  private pool: T.Mesh[] = []; private used = 0;
  private lane = new T.PlaneGeometry(1, 1).rotateX(-Math.PI / 2).translate(0, 0, .5);
  private fan = new T.RingGeometry(2.5, SWEEP, 36, 1, -Math.PI / 2, SWEEP_ARC).rotateX(-Math.PI / 2);
  private disc = new T.CircleGeometry(1, 32).rotateX(-Math.PI / 2);
  private rock = new T.IcosahedronGeometry(1, 1); private glow = new T.IcosahedronGeometry(1, 3);
  private flame = new T.ConeGeometry(1, 1, 10, 1, true).rotateX(-Math.PI / 2).translate(0, 0, .5);
  private mats = new Map<string, T.MeshBasicMaterial>();
  constructor() { this.root.name = 'colossus-attacks'; this.root.add(this.decals.root); }
  private mat(color: string, opacity: number, additive = false) {
    const key = color + opacity + additive; let m = this.mats.get(key);
    if (!m) { m = new T.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, side: T.DoubleSide, toneMapped: false, ...(additive ? { blending: T.AdditiveBlending } : {}) }); this.mats.set(key, m); }
    return m;
  }
  private mesh(geometry: T.BufferGeometry, material: T.Material) {
    let m = this.pool[this.used++];
    if (!m) { m = new T.Mesh(geometry, material); m.raycast = () => {}; m.renderOrder = 4; this.root.add(m); this.pool.push(m); }
    m.geometry = geometry; m.material = material; m.visible = true; m.position.set(0, 0, 0); m.rotation.set(0, 0, 0); m.scale.set(1, 1, 1);
    return m;
  }
  begin() { this.used = 0; this.decals.begin(); }
  /** `head`: where the fire leaves the mouth (world space), for the breath stream. */
  draw(a: ColossusAttack, ground: (x: number, z: number) => number, time: number, head?: { x: number; y: number; z: number }) {
    const color = COLOSSUS_COLORS[a.skill], progress = Math.min(1, a.age / Math.max(.05, a.windup)), after = a.age - a.windup, src = a.source;
    const y = (x: number, z: number) => Math.max(.04, ground(x, z) + .05), m = a.marks[0];
    if (after < 0) {
      if ((a.skill === 'stomp' || a.skill === 'bite' || a.skill === 'slap' || a.skill === 'grab' || a.skill === 'spit') && m) {
        this.decals.draw(m.x, y(m.x, m.z), m.z, m.r, progress, color);
        if (a.skill === 'stomp') this.decals.draw(m.x, y(m.x, m.z) - .01, m.z, 15, progress * .45, '#ffb13d');
      }
      if (a.skill === 'roar') {
        this.decals.draw(src.x, y(src.x, src.z), src.z, COLOSSUS_STATS.roarRange, progress * .35, color);
        for (const f of colossusFeet(src)) this.decals.draw(f.x, y(f.x, f.z) + .02, f.z, COLOSSUS_STATS.footSafe, 1, SAFE);
      }
      if (a.skill === 'breath' && m) { const l = this.mesh(this.lane, this.mat(color, .22 + .2 * progress)); l.position.set(src.x, y(src.x, src.z), src.z); l.rotation.y = a.aim; l.scale.set(5, 1, BREATH * progress); }
      if (a.skill === 'sweep') { const f = this.mesh(this.fan, this.mat(color, .16 + .22 * progress)); f.position.set(src.x, y(src.x, src.z), src.z); f.rotation.y = a.aim; }
    }
    if (a.skill === 'meteor') a.marks.forEach((p, i) => {
      const fall = (p.k ?? 0) * .4 + i * .02, left = fall - after;
      if (left < -.25) return;
      if (left > 0) this.decals.draw(p.x, y(p.x, p.z), p.z, p.r, after < 0 ? progress * .5 : .5 + .5 * (1 - left / Math.max(.05, fall)), color);
      // Each rock drops in over its last 0.6 s from 14 m up (the game camera sits at 17-24 m: higher would fill the view).
      if (after < 0 || left > .6 || left < 0) return;
      const height = left / .6 * 14, r = this.mesh(this.rock, this.mat('#2b2026', 1));
      r.position.set(p.x + height * .3, ground(p.x, p.z) + height + .9, p.z - height * .2); r.scale.setScalar(1.1); r.rotation.set(time * 3 + i, time * 2, 0);
      const g = this.mesh(this.glow, this.mat('#ff7a1e', .4, true)); g.position.copy(r.position); g.scale.setScalar(1.3 + Math.sin(time * 20 + i) * .08);
    });
    if (after < 0) return;
    if (a.skill === 'stomp' && m) {
      // A glowing footprint that cools over its eight seconds.
      const fade = 1 - after / COLOSSUS_ACTIVE.stomp, d = this.mesh(this.disc, this.mat('#ff6a10', .55 * fade + .1, true));
      d.position.set(m.x, y(m.x, m.z) + .03, m.z); d.scale.setScalar(4 * (1 + .04 * Math.sin(time * 6)));
      this.decals.draw(m.x, y(m.x, m.z), m.z, 4, 1, '#ff6a10');
    }
    if (a.skill === 'breath' && m && after < COLOSSUS_ACTIVE.breath) {
      const from = head ?? { x: src.x, y: 6, z: src.z }, end = { x: src.x + forwardOf(a.aim).x * BREATH, z: src.z + forwardOf(a.aim).z * BREATH };
      const dx = end.x - from.x, dz = end.z - from.z, dy = y(end.x, end.z) - from.y, len = Math.hypot(dx, dy, dz), flicker = 1 + Math.sin(time * 37) * .06;
      const outer = this.mesh(this.flame, this.mat('#ff5a10', .5, true)); outer.position.set(from.x, from.y, from.z); outer.lookAt(end.x, y(end.x, end.z), end.z); outer.scale.set(2.8 * flicker, 2.8 * flicker, len);
      const inner = this.mesh(this.flame, this.mat('#ffe27a', .65, true)); inner.position.copy(outer.position); inner.quaternion.copy(outer.quaternion); inner.scale.set(1.2 * flicker, 1.2 * flicker, len * .92);
      const l = this.mesh(this.lane, this.mat('#ff7a1e', .35, true)); l.position.set(src.x, y(src.x, src.z) + .02, src.z); l.rotation.y = a.aim; l.scale.set(5, 1, BREATH);
    }
    if (a.skill === 'sweep' && after <= COLOSSUS_ACTIVE.sweep) {
      const angle = sweepAngle(a), l = this.mesh(this.lane, this.mat(color, .55, true));
      l.position.set(src.x, y(src.x, src.z) + .03, src.z); l.rotation.y = angle; l.scale.set(3.2, 1, SWEEP);
    }
  }
  end() { this.decals.end(); for (let i = this.used; i < this.pool.length; i++) this.pool[i].visible = false; }
  clear() { this.used = 0; this.decals.clear(); this.end(); }
}
