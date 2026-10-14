/**
 * The guided quest walk (FIX-PLAN 5.3). A tap on the quest tracker walks the explorer to the story step's place; on the
 * way, standing-still auto-fight must not pull them off to a creature that merely wanders nearby. Only a creature that
 * goes for the explorer (aggro within a few metres) is fought, and the walk resumes after it. A light trail of dots on
 * the ground points the way: one instanced mesh (a single draw call), its matrices rebuilt five times a second along the
 * pathfinder's route, not every frame. The walk (and its trail) ends on arrival or as soon as the player steers.
 */
import * as T from 'three';

export interface WalkPoint { x: number; z: number }
export interface WalkEnemy { x: number; z: number; hp: number; radius: number; phase?: string }
export interface WalkTarget extends WalkPoint { radius: number }
/** How close a creature going for the explorer must be to count as an attack (metres beyond its body). */
export const DEFEND_RANGE = 4.5;
const aggro = (e: WalkEnemy) => !!e.phase && e.phase !== 'idle' && e.phase !== 'return';
/** The nearest creature attacking the explorer (aggro and close), or null. */
export function attacker<E extends WalkEnemy>(enemies: readonly E[], p: WalkPoint, range = DEFEND_RANGE): E | null {
  let best: E | null = null, bestD = Infinity;
  for (const e of enemies) { if (e.hp <= 0 || !aggro(e)) continue; const d = Math.hypot(e.x - p.x, e.z - p.z) - e.radius; if (d < range && d < bestD) { best = e; bestD = d; } }
  return best;
}
/** While a guided walk is on, auto-fight is held back unless something attacks the explorer. */
export const holdsAutoFight = (walking: boolean, enemies: readonly WalkEnemy[], p: WalkPoint) => walking && !attacker(enemies, p);
/** Arrived: within the target's reach (the same margin as interacting with it). */
export const arrived = (p: WalkPoint, target: WalkTarget) => Math.hypot(target.x - p.x, target.z - p.z) <= target.radius + 2.6;

/** Up to `count` dots `gap` metres apart along the polyline, starting `start` metres out. Pure, for the trail and tests. */
export function trailDots(path: readonly WalkPoint[], count: number, gap: number, start: number): WalkPoint[] {
  const out: WalkPoint[] = []; let want = start, walked = 0;
  for (let i = 1; i < path.length && out.length < count; i++) {
    const a = path[i - 1], b = path[i], len = Math.hypot(b.x - a.x, b.z - a.z); if (len < 1e-6) continue;
    while (want <= walked + len && out.length < count) { const k = (want - walked) / len; out.push({ x: a.x + (b.x - a.x) * k, z: a.z + (b.z - a.z) * k }); want += gap; }
    walked += len;
  }
  return out;
}

export interface QuestWalkWorld {
  position: WalkPoint; route: readonly WalkPoint[]; selected: unknown; destination: unknown;
  keys: { size: number }; joystickInput: WalkPoint | null; enemies: readonly WalkEnemy[];
  select(e: any): void; scene: T.Object3D; ground(p: WalkPoint): number;
}
export type WalkEnd = 'arrived' | 'steered' | 'gone';
const DOTS = 14, GAP = 1.15, REFRESH = .2;
export class QuestWalk {
  target: (WalkTarget & { entity: unknown }) | null = null;
  private mesh: T.InstancedMesh; private clock = 0; private phase = 0; private m = new T.Matrix4(); private q = new T.Quaternion().setFromAxisAngle(new T.Vector3(1, 0, 0), -Math.PI / 2); private v = new T.Vector3(); private sc = new T.Vector3(); private c = new T.Color();
  /** The last reason a walk ended (tests, the dev hook). */
  ended: WalkEnd | null = null;
  private w: QuestWalkWorld;
  constructor(w: QuestWalkWorld) {
    this.w = w;
    const geo = new T.CircleGeometry(.24, 12), mat = new T.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: .95, depthWrite: false, toneMapped: false });
    this.mesh = new T.InstancedMesh(geo, mat, DOTS); this.mesh.name = 'quest-trail'; this.mesh.frustumCulled = false; this.mesh.renderOrder = 2; this.mesh.count = 0; this.mesh.visible = false;
    for (let i = 0; i < DOTS; i++) this.mesh.setColorAt(i, this.c.set('#ffb300'));
    w.scene.add(this.mesh);
  }
  get walking() { return !!this.target; }
  start(entity: { x: number; z: number; radius: number }) { this.target = { x: entity.x, z: entity.z, radius: entity.radius, entity }; this.ended = null; this.clock = REFRESH; this.mesh.visible = true; }
  stop(why: WalkEnd) { if (!this.target) return; this.target = null; this.ended = why; this.mesh.visible = false; this.mesh.count = 0; }
  /** True while auto-fight should stay out of the way. */
  holds() { return holdsAutoFight(this.walking, this.w.enemies, this.w.position); }
  update(dt: number) {
    const tg = this.target, w = this.w; if (!tg) return;
    const j = w.joystickInput;
    if (w.keys.size || (j && Math.hypot(j.x, j.z) > .1)) { this.stop('steered'); return; }
    const sel = w.selected as { kind?: string } | null;
    if (sel && sel !== tg.entity && sel.kind !== 'enemy') { this.stop('steered'); return; } // the player tapped something else
    if (!sel) {
      if (arrived(w.position, tg)) { this.stop('arrived'); return; }
      if (w.destination) { this.stop('steered'); return; } // a tap on the ground
      const foe = attacker(w.enemies, w.position);
      if (foe) w.select(foe); // something attacks: fight back, then walk on
      else w.select(tg.entity); // the fight is over (or the walk was knocked off): walk on
      if (!w.selected) { this.stop('gone'); return; }
    } else if (sel === tg.entity) { const foe = attacker(w.enemies, w.position); if (foe) w.select(foe); }
    this.clock += dt; if (this.clock < REFRESH) return; this.clock = 0; this.phase = (this.phase + .23) % 1;
    const path: WalkPoint[] = [{ x: w.position.x, z: w.position.z }, ...(sel === tg.entity ? w.route : []), { x: tg.x, z: tg.z }];
    const dots = trailDots(path, DOTS, GAP, 1.1 + this.phase * GAP), left = Math.hypot(tg.x - w.position.x, tg.z - w.position.z);
    let n = 0;
    for (const d of dots) {
      if (Math.hypot(d.x - tg.x, d.z - tg.z) < tg.radius + .6) break; // stop short of the target itself
      const fade = 1 - n / DOTS, s = .7 + .5 * fade;
      this.m.compose(this.v.set(d.x, w.ground(d) + .06, d.z), this.q, this.sc.set(s, s, s)); this.mesh.setMatrixAt(n, this.m);
      this.mesh.setColorAt(n, this.c.set('#ffb300').lerp(this.c.clone().set('#ffe680'), 1 - fade)); n++;
    }
    this.mesh.count = left > 2 ? n : 0; this.mesh.instanceMatrix.needsUpdate = true; if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
  dispose() { this.mesh.removeFromParent(); this.mesh.geometry.dispose(); (this.mesh.material as T.Material).dispose(); }
}
