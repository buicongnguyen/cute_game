import * as T from 'three';
import type { Effects } from './fx.ts';
import type { HitSource } from './elite-roles.ts';
import type { DecorPlacement } from './biomes.ts';
import type { OccluderFade } from './occluders.ts';
import type { TallPiece } from './scatter.ts';
import { toonMaterial } from './toon.ts';
import {
  BREAK, BreakLedger, breakClass, breakStage, breakablePieces, bossHolds, effectReaches, hitWorth,
  type BreakBoss, type BreakEffect, type BreakOutcome, type BreakPiece,
} from './breakables.ts';

/**
 * The picture and the solo rules of breakable scenery (breakables.ts). Scenery stays in its instanced tile batches
 * (scatter.ts): a hit wobbles the piece's own instance slots for a moment, a break tips the tree over (or crumbles the
 * stone) and then gives the slots a zero matrix, and a regrowth scales them back up. Nothing is rebuilt. Cracks and bark
 * notches share one small instanced batch, stumps and rubble one each; all three are hidden (no draw call) while empty,
 * so a world where nothing was hit draws exactly what it drew before. Chips, leaves and dust come from the shared
 * particle pools (fx.ts). The piece's collider shrinks to nothing while it is broken and comes back when it regrows.
 *
 * Online the server decides (combat-authority.mjs): a hit is sent as a request and only shakes the piece here; the
 * server's word (`apply`) wears it, breaks it or regrows it, for every player in the room alike.
 */
export interface BreakViewHost {
  planet(): string;
  decor(): readonly DecorPlacement[];
  obstacles(): { x: number; z: number; r: number }[];
  /** The scatter group (scatter.ts buildScatter) now drawn, or null. */
  scatter(): T.Object3D | null;
  occluders(): OccluderFade | undefined;
  scene(): T.Object3D;
  fx(): Effects | null;
  /** Bosses near enough to matter, with whether each is fighting someone. */
  bosses(): Iterable<BreakBoss>;
  /** The explorer, and the other players (the spot must be free to regrow). */
  explorer(): { x: number; z: number };
  others(): Iterable<{ x: number; z: number }>;
  /** Seconds, a steady clock. */
  now(): number;
  /** Online: the server decides; the request goes there. */
  online(): boolean;
  send(id: string, source: HitSource): void;
  /** Solo: a felled piece's drop (breakables.ts grantBreakDrop); returns how many were given. */
  drop(type: string): number;
  /** Something to tell the player once: the first break, the first hit the boss held. */
  note(kind: 'first-break' | 'held' | 'wood', count?: number): void;
  sound(kind: 'chop' | 'crack' | 'fall' | 'crumble' | 'grow'): void;
  reduced(): boolean;
}
interface Slot { mesh: T.InstancedMesh; index: number; base: T.Matrix4 | null }
interface Anim { id: string; mode: 'shake' | 'fall' | 'crumble' | 'grow'; t: number; time: number; amp: number; ax: number; az: number }
interface Placed { piece: BreakPiece; p: DecorPlacement; height: number; radius: number; obstacle?: { r: number }; r0: number; /** The way a worn tree leans (away from the first blow). */ ax: number; az: number }

const m4 = new T.Matrix4(), q2 = new T.Quaternion(), axis2 = new T.Vector3();
const zero = new T.Matrix4().makeScale(0, 0, 0), m1 = new T.Matrix4(), m2 = new T.Matrix4(), m3 = new T.Matrix4(), q = new T.Quaternion(), v = new T.Vector3(), axis = new T.Vector3(), color = new T.Color();
const CRACK_CAP = 160, STUMP_CAP = 48;
/** A broken piece's collider radius: below any clearance, so nothing (walkers, creatures, shots, routes) meets it. */
const GONE = -8;
/** Crack strips per stage on a stone, notches per stage on a tree. */
const STRIPS = { stone: [0, 2, 4, 7], tree: [0, 0, 0, 0] } as const;
/** A worn tree leans a little more at each stage (seen from the high camera, where its trunk is under the crown). */
const LEAN = [0, .06, .12, .19] as const;
/** Where each crack runs: [angle from +z (the camera's side), height as a share of the stone's]. */
const CRACK_SPOTS = [[0, .55], [.75, .45], [-.65, .6], [1.25, .4], [-1.2, .5], [.35, .3], [-.3, .72]] as const;
const CHIPS = { tree: ['#ffffff', '#e8f4ff', '#3f8a5a', '#c9a27a'], stone: ['#e6eef6', '#b9c8d8', '#8796a8'] } as const;
const ease = (t: number) => t * t * (3 - 2 * t);

export class BreakablesView {
  readonly ledger = new BreakLedger();
  private host: BreakViewHost;
  private decorRef: readonly DecorPlacement[] | null = null; private groupRef: T.Object3D | null = null;
  private placed = new Map<string, Placed>(); private cells = new Map<string, Placed[]>();
  private slots = new Map<string, Slot[]>(); private slotKeys = new Map<string, string>();
  private anims = new Map<string, Anim>();
  /** Broken here (solo or as the server said), and the stage each damaged piece shows. */
  private down = new Set<string>(); private stages = new Map<string, number>();
  private cracks: T.InstancedMesh | null = null; private stumps: T.InstancedMesh | null = null; private rubble: T.InstancedMesh | null = null;
  private regrowClock = 0;
  /** Counts for tests and the tester: hits that wore, that a boss held, breaks, regrowths. */
  stats = { wear: 0, held: 0, breaks: 0, regrown: 0 };
  constructor(host: BreakViewHost) { this.host = host; }

  /** Breakable pieces of the world now (empty off the Ice planet). */
  pieces() { this.sync(); return [...this.placed.values()].map(p => p.piece); }
  isBroken(id: string) { return this.down.has(id); }
  stageOf(id: string) { return this.stages.get(id) ?? 0; }

  /** A combat effect of the explorer's own (main.ts combat host): every piece its area reaches takes the hit. */
  effect(e: BreakEffect) {
    if (e.quiet || !e.source || !(hitWorthAny(e.source))) return;
    if (!this.sync()) return;
    const reach = Math.max(1, e.kind === 'beam' ? e.radius : e.radius) + 1.5;
    for (const pl of this.near(e.x, e.z, e.kind === 'cast' ? Math.max(5, e.radius) + 1.5 : reach)) if (effectReaches(e, pl.piece)) this.strike(pl.piece.id, e.source);
  }
  /** The power strike (main.ts releasePower): `reaches` is power-rules.ts powerReach for the shape. */
  power(reaches: (target: { x: number; z: number; radius: number }) => boolean, around: { x: number; z: number }, range: number) {
    if (!this.sync()) return;
    for (const pl of this.near(around.x, around.z, range + 1.5)) if (reaches({ x: pl.piece.x, z: pl.piece.z, radius: pl.piece.r })) this.strike(pl.piece.id, 'power');
  }
  /**
   * A press of Attack with no creature in reach (main.ts basicAttack): the nearest standing piece within `reach` m in
   * front (or right beside) the explorer, or null. The caller faces it, swings and calls strike().
   */
  chopTarget(from: { x: number; z: number }, facing: number, reach: number): BreakPiece | null {
    if (!this.sync()) return null;
    let best: Placed | null = null, bestD = Infinity;
    for (const pl of this.near(from.x, from.z, reach + 1.5)) {
      if (this.down.has(pl.piece.id)) continue;
      const dx = pl.piece.x - from.x, dz = pl.piece.z - from.z, d = Math.hypot(dx, dz) - pl.piece.r;
      if (d > reach) continue;
      const along = d > .8 ? (dx * Math.sin(facing) + dz * Math.cos(facing)) / Math.hypot(dx, dz) : 1;
      const score = d - along * 1.2; if (along < -.2) continue;
      if (score < bestD) { bestD = score; best = pl; }
    }
    return best?.piece ?? null;
  }
  /** One hit of `source` on piece `id`. Solo: the ledger here decides. Online: the piece shakes and the server is asked. */
  strike(id: string, source: HitSource) {
    const pl = this.placed.get(id); if (!pl || this.down.has(id) || !(hitWorth(pl.piece.type, source) > 0)) return;
    const held = bossHolds(pl.piece.x, pl.piece.z, this.host.bosses());
    if (this.host.online()) {
      if (this.anims.get(id)?.mode === 'shake' && (this.anims.get(id)!.t < .12)) return; // the same blow, twice
      this.shake(pl, held ? .5 : 1); this.chips(pl, held ? 4 : 7); this.host.send(id, source); return;
    }
    const r = this.ledger.hit(pl.piece, source, this.host.now(), held);
    this.show(id, r.outcome, r.hp, r.max);
  }
  /**
   * The server's word on a piece (online): 'wear' / 'held' (a hit), 'break', 'regrow'; `quiet` sets the state without
   * the show (a newcomer's snapshot). `hp` of `max`.
   */
  apply(id: string, outcome: BreakOutcome | 'regrow', hp: number, quiet = false) {
    if (!this.sync()) return; const pl = this.placed.get(id); if (!pl) return;
    const max = BREAK.hp[breakClass(pl.piece.type)!];
    if (outcome === 'regrow') { if (this.down.has(id)) this.regrow(pl, quiet); else { this.stages.delete(id); this.drawMarks(); } return; }
    if (quiet) {
      if (outcome === 'break') { if (!this.down.has(id)) this.fell(pl, true); }
      else { const s = breakStage(hp, max); if (s !== (this.stages.get(id) ?? 0)) { if (s) this.stages.set(id, s); else this.stages.delete(id); this.drawMarks(); if (!this.anims.has(id)) this.pose(pl, null); } }
      return;
    }
    this.show(id, outcome, hp, max);
  }
  /** Online snapshot (all damaged or broken pieces): brings this view to the server's state without the show. */
  applySnapshot(list: [string, number, number][]) {
    if (!this.sync()) return; const seen = new Set<string>();
    for (const [id, hp, regrowIn] of list) { seen.add(id); this.apply(id, regrowIn >= 0 ? 'break' : 'wear', hp, true); }
    for (const id of [...this.down]) if (!seen.has(id)) { const pl = this.placed.get(id); if (pl) this.regrow(pl, false); }
    let changed = false; for (const id of [...this.stages.keys()]) if (!seen.has(id) && !this.down.has(id)) { this.stages.delete(id); changed = true; }
    if (changed) this.drawMarks();
  }

  private show(id: string, outcome: BreakOutcome, hp: number, max: number) {
    const pl = this.placed.get(id); if (!pl) return;
    if (outcome === 'held') { this.stats.held++; this.shake(pl, .45); this.chips(pl, 4); this.host.note('held'); this.host.sound('chop'); return; }
    if (outcome === 'wear') {
      this.stats.wear++; const stage = breakStage(hp, max), was = this.stages.get(id) ?? 0;
      this.shake(pl, 1 + stage * .25); this.chips(pl, 8 + stage * 3);
      if (stage !== was) { this.stages.set(id, stage); this.drawMarks(); this.host.sound('crack'); } else this.host.sound('chop');
      return;
    }
    if (outcome === 'break') {
      this.stats.breaks++; this.fell(pl, false);
      const n = this.host.online() ? 0 : this.host.drop(pl.piece.type);
      this.host.note('first-break'); if (n > 0) this.host.note('wood', n);
    }
  }

  /** Per frame: animations; solo regrowth once a second. Returns at once when nothing moves. */
  update(dt: number) {
    if (this.anims.size) for (const a of [...this.anims.values()]) this.animate(a, dt);
    if (!this.host.online() && this.down.size && (this.regrowClock -= dt) <= 0) {
      this.regrowClock = 1;
      const me = this.host.explorer(), others = [...this.host.others()];
      const occupied = (x: number, z: number, r: number) => Math.hypot(me.x - x, me.z - z) < r || others.some(o => Math.hypot(o.x - x, o.z - z) < r);
      for (const id of this.ledger.regrow(this.host.now(), i => this.placed.get(i)?.piece, occupied)) { const pl = this.placed.get(id); if (pl) this.regrow(pl, false); }
    }
  }
  /** A world change: forget the old world's pieces (solo damage starts fresh). */
  clear() {
    for (const id of [...this.down]) { const pl = this.placed.get(id); if (pl?.obstacle) pl.obstacle.r = pl.r0; }
    this.ledger.clear(); this.down.clear(); this.stages.clear(); this.anims.clear(); this.placed.clear(); this.cells.clear(); this.slots.clear(); this.slotKeys.clear();
    this.decorRef = null; this.groupRef = null; this.drawMarks();
  }

  /** Re-indexes when the world or its scatter batches changed. False when this world has nothing breakable. */
  private sync() {
    const decor = this.host.decor(), group = this.host.scatter();
    if (decor !== this.decorRef) {
      this.clear(); this.decorRef = decor;
      const obstacles = this.host.obstacles(), byXZ = new Map<string, { r: number }>();
      for (const o of obstacles) byXZ.set(o.x + '|' + o.z, o);
      const planet = this.host.planet();
      for (const p of decor) {
        const piece = breakablePieces(planet, [p])[0]; if (!piece) continue;
        const o = byXZ.get(piece.x + '|' + piece.z), pl: Placed = { piece, p, height: 3, radius: piece.r, obstacle: o, r0: o?.r ?? piece.r, ax: 0, az: 0 };
        this.placed.set(piece.id, pl); const key = cell(piece.x, piece.z); let list = this.cells.get(key); if (!list) this.cells.set(key, list = []); list.push(pl);
      }
    }
    if (!this.placed.size) return false;
    if (group !== this.groupRef) {
      this.groupRef = group; this.slots.clear(); this.slotKeys.clear(); this.anims.clear();
      if (group) {
        group.traverse(o => {
          if (!(o instanceof T.InstancedMesh) || !breakClass(String(o.userData.scatter)) || !Array.isArray(o.userData.pieces)) return;
          const list = o.userData.pieces as DecorPlacement[], ext = o.userData.extent as { height: number; radius: number } | undefined;
          list.forEach((p, index) => {
            if (!(p.radius > 0)) return;
            const id = pieceKey(p), pl = this.placed.get(id); if (!pl) return;
            if (ext) { pl.height = ext.height * p.scale; pl.radius = Math.max(pl.piece.r, ext.radius * p.scale); }
            let s = this.slots.get(id); if (!s) this.slots.set(id, s = []); s.push({ mesh: o, index, base: null });
            this.slotKeys.set(o.uuid + ':' + index, id);
          });
        });
        const occ = this.host.occluders(); if (occ) occ.skip = (piece: TallPiece) => { const id = this.slotKeys.get(piece.meshes[0]?.uuid + ':' + piece.index); return !!id && (this.down.has(id) || this.anims.has(id)); };
        // A rebuilt batch draws every piece: hide the broken ones again.
        for (const id of this.down) for (const s of this.slots.get(id) ?? []) this.write(s, zero);
      }
      this.ensureMarks(); this.drawMarks();
    }
    return true;
  }
  private near(x: number, z: number, radius: number) {
    const out: Placed[] = [];
    for (let i = Math.floor((x - radius) / 8); i <= Math.floor((x + radius) / 8); i++) for (let j = Math.floor((z - radius) / 8); j <= Math.floor((z + radius) / 8); j++)
      for (const pl of this.cells.get(i + '|' + j) ?? []) if (Math.hypot(pl.piece.x - x, pl.piece.z - z) <= radius + pl.piece.r) out.push(pl);
    return out;
  }
  /** The slot's own matrix, read once (after the fade overlay gave the slot back). */
  private base(s: Slot) {
    // A piece faded by the occluder (its slot zeroed, a copy in the overlay) is put back first; while it moves the occluder skips it.
    this.host.occluders()?.release(s.mesh, s.index);
    if (!s.base) { s.base = new T.Matrix4(); s.mesh.getMatrixAt(s.index, s.base); }
    return s.base;
  }
  private write(s: Slot, m: T.Matrix4) { s.mesh.setMatrixAt(s.index, m); s.mesh.instanceMatrix.addUpdateRange(s.index * 16, 16); s.mesh.instanceMatrix.needsUpdate = true; }
  /** Sets every slot of the piece to base transformed about the piece's foot by `x` (a rotation or a scale). */
  private pose(pl: Placed, x: T.Matrix4 | null) {
    const p = pl.p, lean = breakClass(pl.piece.type) === 'tree' && !this.down.has(pl.piece.id) ? LEAN[this.stages.get(pl.piece.id) ?? 0] : 0;
    if (lean && (pl.ax || pl.az)) { m4.makeRotationFromQuaternion(q2.setFromAxisAngle(axis2.set(pl.ax, 0, pl.az), lean)); x = x ? m4.multiply(x) : m4; }
    for (const s of this.slots.get(pl.piece.id) ?? []) {
      const b = this.base(s);
      if (!x) { this.write(s, b); continue; }
      m1.makeTranslation(p.x, p.y, p.z).multiply(x).multiply(m2.makeTranslation(-p.x, -p.y, -p.z)).multiply(b); this.write(s, m1);
    }
  }
  private shake(pl: Placed, amp: number) {
    if (this.host.reduced()) amp *= .4;
    const me = this.host.explorer(), dx = pl.piece.x - me.x, dz = pl.piece.z - me.z, d = Math.hypot(dx, dz) || 1;
    const cur = this.anims.get(pl.piece.id); if (cur && cur.mode !== 'shake') return;
    if (!pl.ax && !pl.az) { pl.ax = dz / d; pl.az = -dx / d; }
    this.anims.set(pl.piece.id, { id: pl.piece.id, mode: 'shake', t: 0, time: .42, amp: (breakClass(pl.piece.type) === 'stone' ? .035 : .075) * amp, ax: dz / d, az: -dx / d });
  }
  private chips(pl: Placed, n: number) {
    const fx = this.host.fx(); if (!fx) return; const c = breakClass(pl.piece.type)!, me = this.host.explorer();
    const dx = me.x - pl.piece.x, dz = me.z - pl.piece.z, d = Math.hypot(dx, dz) || 1, at = { x: pl.piece.x + dx / d * pl.radius * .8, z: pl.piece.z + dz / d * pl.radius * .8 };
    if (c === 'tree') {
      const crown = { x: pl.piece.x + dx / d * 1.1 * pl.p.scale, z: pl.piece.z + dz / d * 1.1 * pl.p.scale };
      fx.burst(crown, { n, color: [...CHIPS.tree], size: .14, speed: 3.4, up: 3.5, y: pl.p.y + pl.height * .45, life: .7 });
      fx.burst({ x: pl.piece.x, z: pl.piece.z }, { n: Math.ceil(n * .9), color: ['#ffffff', '#f2f8ff'], glow: true, size: .17, speed: 1.8, up: 1.2, y: pl.p.y + pl.height * .9, life: 1.2, gravity: 4, spread: 1.4 });
    } else fx.burst(at, { n, color: [...CHIPS.stone], size: .11, speed: 3.6, up: 3.4, y: pl.p.y + Math.min(.8, pl.height * .5), life: .55, gravity: 16 });
  }
  /** Breaks the piece: a tree tips over away from the explorer, a stone crumbles; then its slots hide, a stump or rubble stays and its collider goes. */
  private fell(pl: Placed, quiet: boolean) {
    const id = pl.piece.id; this.down.add(id); this.stages.delete(id);
    if (pl.obstacle) pl.obstacle.r = GONE;
    for (const s of this.slots.get(id) ?? []) this.base(s);
    if (quiet) { this.anims.delete(id); for (const s of this.slots.get(id) ?? []) this.write(s, zero); this.drawMarks(); return; }
    const me = this.host.explorer(), dx = pl.piece.x - me.x, dz = pl.piece.z - me.z, d = Math.hypot(dx, dz) || 1, tree = breakClass(pl.piece.type) === 'tree';
    this.anims.set(id, { id, mode: tree ? 'fall' : 'crumble', t: 0, time: tree ? .62 : .3, amp: 1, ax: dz / d, az: -dx / d });
    this.drawMarks(); this.chips(pl, 16); this.host.sound(tree ? 'fall' : 'crumble'); this.host.fx()?.shake(tree ? .12 : .16);
  }
  private regrow(pl: Placed, quiet: boolean) {
    const id = pl.piece.id; this.down.delete(id); this.stages.delete(id); this.ledger.entries.delete(id); this.stats.regrown++;
    if (pl.obstacle) pl.obstacle.r = pl.r0;
    if (quiet || this.host.reduced()) { this.anims.delete(id); this.pose(pl, null); }
    else { this.anims.set(id, { id, mode: 'grow', t: 0, time: BREAK.grow, amp: 1, ax: 0, az: 0 }); this.host.sound('grow');
      this.host.fx()?.burst({ x: pl.piece.x, z: pl.piece.z }, { n: 8, color: ['#9be36f', '#ffffff', '#cfeec0'], glow: true, size: .1, speed: 1.4, up: 2.6, y: pl.p.y + .2, life: .7 }); }
    this.drawMarks();
  }
  private animate(a: Anim, dt: number) {
    const pl = this.placed.get(a.id); if (!pl) { this.anims.delete(a.id); return; }
    a.t += dt; const k = Math.min(1, a.t / a.time);
    if (a.mode === 'shake') {
      if (k >= 1) { this.anims.delete(a.id); this.pose(pl, null); return; }
      const angle = Math.sin(a.t * 38) * a.amp * (1 - k); this.pose(pl, m3.makeRotationFromQuaternion(q.setFromAxisAngle(axis.set(a.ax, 0, a.az), angle)));
    } else if (a.mode === 'fall') {
      if (k >= 1) {
        this.anims.delete(a.id); for (const s of this.slots.get(a.id) ?? []) this.write(s, zero);
        const fx = this.host.fx(), h = pl.height * .55, at = { x: pl.piece.x - a.az * h, z: pl.piece.z + a.ax * h };
        fx?.burst(at, { n: 26, color: ['#ffffff', '#e8f4ff', '#3f8a5a', '#2f6e4a'], size: .16, speed: 4.5, up: 4, y: pl.p.y + .4, life: .9 });
        fx?.burst(at, { n: 14, color: ['#ffffff'], glow: true, size: .2, speed: 2.5, up: 2, y: pl.p.y + .3, life: .8, gravity: 4, spread: 2 });
        fx?.ring(at, { color: '#ffffff', from: .4, to: 2.6, life: .5, y: pl.p.y + .08, thick: .2, opacity: .8 }); return;
      }
      this.pose(pl, m3.makeRotationFromQuaternion(q.setFromAxisAngle(axis.set(a.ax, 0, a.az), ease(k) * k * 1.45)));
    } else if (a.mode === 'crumble') {
      if (k >= 1) {
        this.anims.delete(a.id); for (const s of this.slots.get(a.id) ?? []) this.write(s, zero);
        const fx = this.host.fx(), at = { x: pl.piece.x, z: pl.piece.z };
        fx?.burst(at, { n: 30, color: [...CHIPS.stone, '#ffffff'], size: .2, speed: 5.5, up: 5, y: pl.p.y + .4, life: .8, gravity: 18 });
        fx?.ring(at, { color: '#dfe8f2', from: .3, to: 2.4, life: .45, y: pl.p.y + .08, thick: .25, opacity: .8 }); return;
      }
      const s = 1 - .35 * ease(k), w = 1 + .12 * k; this.pose(pl, m3.makeScale(w, s, w));
    } else {
      if (k >= 1) { this.anims.delete(a.id); this.pose(pl, null); return; }
      // Sprout: rise from the ground with a small overshoot.
      const g = k < .75 ? ease(k / .75) * 1.08 : 1.08 - .08 * ease((k - .75) / .25), s = Math.max(.02, g); this.pose(pl, m3.makeScale(s, s, s));
    }
  }

  /** The three small shared batches (cracks and notches, stumps, rubble), made once and hidden while empty. */
  private ensureMarks() {
    const scene = this.host.scene();
    if (!this.cracks) {
      const strip = new T.BoxGeometry(.045, .03, .2), parts: T.BufferGeometry[] = [];
      for (const [x, z, r] of [[0, -.16, .45], [.03, 0, -.5], [0, .16, .4]] as const) parts.push(strip.clone().rotateY(r).translate(x, 0, z));
      const g = mergeBoxes(parts); strip.dispose(); parts.forEach(p => p.dispose());
      this.cracks = new T.InstancedMesh(g, new T.MeshBasicMaterial({ color: '#ffffff' }), CRACK_CAP);
      this.cracks.setColorAt(0, color.set('#2d3b4f')); this.cracks.instanceMatrix.setUsage(T.DynamicDrawUsage);
      this.cracks.count = 0; this.cracks.visible = false; this.cracks.frustumCulled = false; this.cracks.name = 'break-marks';
      const stump = new T.CylinderGeometry(.26, .32, .34, 8).translate(0, .17, 0);
      this.stumps = new T.InstancedMesh(stump, toonMaterial({ color: '#8a5a3b' }), STUMP_CAP);
      const rocks: T.BufferGeometry[] = [];
      for (const [x, z, s] of [[-.35, .1, .32], [.3, -.15, .26], [.05, .35, .22], [.1, -.05, .18]] as const) rocks.push(new T.DodecahedronGeometry(s, 0).scale(1, .7, 1).translate(x, s * .5, z));
      this.rubble = new T.InstancedMesh(mergeBoxes(rocks), toonMaterial({ color: '#a9bad0' }), STUMP_CAP); rocks.forEach(r => r.dispose());
      for (const m of [this.stumps, this.rubble]) { m.count = 0; m.visible = false; m.frustumCulled = false; m.castShadow = false; m.receiveShadow = true; m.instanceMatrix.setUsage(T.DynamicDrawUsage); }
      this.stumps.name = 'break-stumps'; this.rubble.name = 'break-rubble';
    }
    for (const m of [this.cracks!, this.stumps!, this.rubble!]) if (m.parent !== scene) scene.add(m);
  }
  /** Redraws cracks, notches, stumps and rubble from the state (only when it changes). */
  private drawMarks() {
    if (!this.cracks || !this.stumps || !this.rubble) return;
    let c = 0, st = 0, ru = 0;
    for (const [id, stage] of this.stages) {
      const pl = this.placed.get(id); if (!pl || this.down.has(id)) continue;
      const tree = breakClass(pl.piece.type) === 'tree', n = (tree ? STRIPS.tree : STRIPS.stone)[stage] ?? 0, p = pl.p;
      for (let k = 0; k < n && c < CRACK_CAP; k++) {
        // Zigzags running down the stone's face toward the camera (the game's camera looks from +z), spreading as it weakens.
        const [a, h] = CRACK_SPOTS[k], R = pl.radius * .74, H = pl.height;
        q.setFromEuler(new T.Euler(0, a, 0)).multiply(q2.setFromAxisAngle(axis2.set(1, 0, 0), 1.2));
        m1.compose(v.set(p.x + Math.sin(a) * R, p.y + H * h, p.z + Math.cos(a) * R), q, axis.set(1.2, 1, .8).multiplyScalar(.5 + R * .25));
        this.cracks.setMatrixAt(c, m1); this.cracks.setColorAt(c, color.set('#1f2a3c')); c++;
      }
    }
    for (const id of this.down) {
      const pl = this.placed.get(id); if (!pl) continue; const p = pl.p;
      m1.compose(v.set(p.x, p.y, p.z), q.setFromAxisAngle(axis.set(0, 1, 0), p.rotation), axis.set(1, 1, 1).multiplyScalar(p.scale));
      if (breakClass(pl.piece.type) === 'tree') { if (st < STUMP_CAP) this.stumps.setMatrixAt(st++, m1); }
      else if (ru < STUMP_CAP) this.rubble.setMatrixAt(ru++, m1);
    }
    const set = (m: T.InstancedMesh, n: number) => { m.count = n; m.visible = n > 0; m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; };
    set(this.cracks, c); set(this.stumps, st); set(this.rubble, ru);
  }
}

const cell = (x: number, z: number) => Math.floor(x / 8) + '|' + Math.floor(z / 8);
const pieceKey = (p: DecorPlacement) => `${p.type}@${Math.round(p.x * 10)}:${Math.round(p.z * 10)}`;
const hitWorthAny = (source: HitSource) => (BREAK.worth.tree[source] ?? 0) > 0 || (BREAK.worth.stone[source] ?? 0) > 0;
/** Merges small non-indexed-compatible geometries (position + normal only) into one. */
function mergeBoxes(list: T.BufferGeometry[]) {
  const pos: number[] = [], nor: number[] = [];
  for (const g0 of list) { const g = g0.index ? g0.toNonIndexed() : g0; pos.push(...(g.getAttribute('position').array as Float32Array)); nor.push(...(g.getAttribute('normal').array as Float32Array)); if (g !== g0) g.dispose(); }
  const out = new T.BufferGeometry(); out.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); out.setAttribute('normal', new T.Float32BufferAttribute(nor, 3)); return out;
}
