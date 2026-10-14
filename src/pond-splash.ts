import type * as T from 'three';
import type { Effects } from './fx.ts';
import type { CombatEffect } from './combat.ts';
import type { FishHandle } from './fish-school.ts';
import { MOVES } from './moves.ts';
import { powerReach, type PowerShape } from './power-rules.ts';
import { pondLook } from './pond-view.ts';

/**
 * Ponds answer big moves (the owner's request, 2026-10-14): when a skill's area (Lob, Rush, Quake and their air
 * versions, a disguise's area skills), a power strike or a dive touches a pond, the water bursts up in a column with
 * rings, and one or two of the pond's fish leap out in an arc and fall back in. Looks only: no reward, no state, nothing
 * is sent to the server. Built from what is already there: the shared particles and rings (fx.ts) and the instanced
 * pond fish (fish-school.ts, through FishingView.makeFish), so a splash adds no draw call of its own and loads nothing.
 * Each pond rests SPLASH.cooldown s between splashes, and at most SPLASH.fishMax fish are in the air at once.
 * Battery saver (fx.density <= .5) halves the particles and leaps one fish; reduced motion keeps a small splash and no fish.
 */
export const SPLASH = {
  /** Seconds a pond rests between two splashes. */
  cooldown: 2,
  /** The smallest area (m) that counts as a big move: a plain hit's ring is smaller. */
  minRadius: 1,
  /** Fish that leap from one splash (normal, Battery saver), and the most in the air at once. */
  leaps: 2, leapsLow: 1, fishMax: 4,
  /** Seconds of a leap, its height range (m), and how far it lands from where it left (m). */
  leapTime: .95, height: [1.7, 2.6] as const, hop: [1.1, 2.2] as const,
  /** Particles of the column (normal and Battery saver are fx.density scaled again by fx.burst). */
  column: 26, spray: 12,
  /** The rings: their widest radius as a share of the move's reach into the pond, and the second ring's delay (s). */
  ring: 2.6, ringDelay: .16,
} as const;

export interface SplashPond { id: string | number; x: number; z: number; /** Radius of the water line. */ r: number; surface: number; waterId: string }
export interface SplashHit { pond: SplashPond; /** Where on the water the burst rises. */ x: number; z: number }

/** The point of the pond nearest to (x, z), kept a little inside its water line; the centre itself when (x, z) is on the water. */
export function waterPoint(p: SplashPond, x: number, z: number): { x: number; z: number } {
  const dx = x - p.x, dz = z - p.z, d = Math.hypot(dx, dz), inside = p.r * .7;
  return d <= inside ? { x, z } : { x: p.x + dx / d * inside, z: p.z + dz / d * inside };
}
/** A round area at (x, z) touches the pond. */
export const ringTouches = (p: SplashPond, x: number, z: number, radius: number) => Math.hypot(x - p.x, z - p.z) <= radius + p.r;
/** A straight run (a rush) from (x, z) along `facing` for `length` m, `half` m wide each side, touches the pond: returns the nearest point of the run, or null. */
export function pathTouches(p: SplashPond, x: number, z: number, facing: number, length: number, half: number): { x: number; z: number } | null {
  const sx = Math.sin(facing), sz = Math.cos(facing), along = Math.max(0, Math.min(length, (p.x - x) * sx + (p.z - z) * sz)), nx = x + sx * along, nz = z + sz * along;
  return Math.hypot(p.x - nx, p.z - nz) <= p.r + half ? { x: nx, z: nz } : null;
}
/** Which ponds a combat effect of the explorer's own reaches (a big area landing or a rush), and where each bursts. */
export function effectHits(ponds: readonly SplashPond[], e: CombatEffect): SplashHit[] {
  if (e.quiet || !Number.isFinite(e.x + e.z + e.radius)) return [];
  const out: SplashHit[] = [];
  if (e.kind === 'ring' && e.radius >= SPLASH.minRadius) { for (const pond of ponds) if (ringTouches(pond, e.x, e.z, e.radius)) out.push({ pond, ...waterPoint(pond, e.x, e.z) }); }
  else if (e.kind === 'cast' && e.look === 'rush') {
    const R = MOVES.rush;
    for (const pond of ponds) { const at = pathTouches(pond, e.x, e.z, e.facing ?? 0, R.length, R.width); if (at) out.push({ pond, ...waterPoint(pond, at.x, at.z) }); }
  }
  return out;
}
/** Which ponds a power strike of `shape` (power-rules.ts: the same test that picks the creatures it hits) reaches. */
export function powerHits(ponds: readonly SplashPond[], shape: PowerShape, level: number, at: { x: number; z: number }, facing: number): SplashHit[] {
  const out: SplashHit[] = [];
  for (const pond of ponds) {
    const along = powerReach(shape, level, at, facing, { x: pond.x, z: pond.z, radius: pond.r });
    if (along < 0) continue;
    // A ring bursts on the water nearest the explorer; a wave, cone or beam where its line runs into the pond.
    const d = Math.min(along + pond.r * .3, Math.hypot(pond.x - at.x, pond.z - at.z)), x = shape === 'ring' ? at.x : at.x + Math.sin(facing) * d, z = shape === 'ring' ? at.z : at.z + Math.cos(facing) * d;
    out.push({ pond, ...waterPoint(pond, x, z) });
  }
  return out;
}
/** Each pond's rest between splashes. */
export class SplashGate {
  private last = new Map<string | number, number>();
  ready(id: string | number, now: number) { const t = this.last.get(id); if (t !== undefined && now - t < SPLASH.cooldown && now >= t) return false; this.last.set(id, now); return true; }
  clear() { this.last.clear(); }
}
/** Where a leaping fish is at `k` (0..1) of its leap from (x0, y, z0) to (x1, y, z1), `h` m high at the top; and its pitch (nose up, then down). */
export function leapAt(k: number, x0: number, z0: number, x1: number, z1: number, y: number, h: number) {
  const s = Math.max(0, Math.min(1, k));
  return { x: x0 + (x1 - x0) * s, y: y - .25 + 4 * h * s * (1 - s), z: z0 + (z1 - z0) * s, pitch: Math.atan2(4 * h * (1 - 2 * s), Math.hypot(x1 - x0, z1 - z0) || 1) };
}

export interface SplashHost {
  /** The scene the leaping fish join while they fly. */ root(): T.Object3D | null;
  fx(): Effects | null;
  ponds(): readonly SplashPond[];
  /** A pond fish model drawn through the fish school, or null (the kit is not loaded yet: then no fish leap). */ fish(species: string): FishHandle | null;
  /** A species living in this water. */ species(waterId: string): string;
  /** Seconds, game time. */ now(): number;
  reduced(): boolean;
  random?(): number;
}
interface Leaper { handle: FishHandle; t: number; x0: number; z0: number; x1: number; z1: number; y: number; h: number; heading: number; color: string }
interface Later { at: number; run: () => void }

export class PondSplash {
  private gate = new SplashGate(); private flying: Leaper[] = []; private queue: Later[] = []; private host: SplashHost;
  /** Splashes made (tests, the tester). */ count = 0;
  constructor(host: SplashHost) { this.host = host; }
  get airborne() { return this.flying.length; }
  /** A combat effect of the explorer's own (main.ts combat host): a big area landing or a rush. */
  effect(e: CombatEffect) { const ponds = this.host.ponds(); if (ponds.length) this.splash(effectHits(ponds, e)); }
  /** The power strike (main.ts releasePower). */
  power(shape: PowerShape, level: number, at: { x: number; z: number }, facing: number) { const ponds = this.host.ponds(); if (ponds.length) this.splash(powerHits(ponds, shape, level, at, facing)); }

  private splash(hits: SplashHit[]) {
    const fx = this.host.fx(); if (!fx || !hits.length) return;
    const now = this.host.now(), reduced = this.host.reduced(), low = fx.density <= .5, rnd = this.host.random ?? Math.random;
    for (const { pond, x, z } of hits) {
      if (!this.gate.ready(pond.id, now)) continue;
      this.count++;
      const look = pondLook(pond.waterId), y = pond.surface + .05, colors = ['#ffffff', look.water, look.shallow];
      if (reduced) { fx.ring({ x, z }, { color: '#ffffff', from: .3, to: 1.6, life: .45, y, thick: .12, opacity: .7 }); fx.burst({ x, z }, { n: 6, color: colors, speed: 1.5, up: 2.5, size: .12, life: .5, gravity: 10, y }); continue; }
      // The column: water thrown high and narrow, then a wide spray low round it.
      fx.burst({ x, z }, { n: low ? Math.round(SPLASH.column / 2) : SPLASH.column, color: ['#ffffff', '#ffffff', look.shallow], glow: true, speed: 1.3, up: 10.5, spread: .3, size: .26, life: 1, gravity: 15, y });
      fx.burst({ x, z }, { n: low ? Math.round(SPLASH.spray / 2) : SPLASH.spray, color: colors, speed: 4.2, up: 3.2, size: .12, life: .6, gravity: 12, y });
      const wide = Math.min(pond.r * 1.1, SPLASH.ring);
      fx.ring({ x, z }, { color: '#ffffff', from: .3, to: wide, life: .55, y, thick: .16, opacity: .85 });
      this.queue.push({ at: now + SPLASH.ringDelay, run: () => this.host.fx()?.ring({ x, z }, { color: look.shallow, from: .2, to: wide * .7, life: .5, y, thick: .1, opacity: .7 }) });
      // One or two of the pond's fish leap out of the burst and dive back in a little way off, inside the water.
      const n = Math.min(low ? SPLASH.leapsLow : SPLASH.leaps, SPLASH.fishMax - this.flying.length), root = this.host.root();
      for (let i = 0; i < n && root; i++) {
        const handle = this.host.fish(this.host.species(pond.waterId)); if (!handle) break;
        const a = rnd() * Math.PI * 2, hop = SPLASH.hop[0] + rnd() * (SPLASH.hop[1] - SPLASH.hop[0]), x0 = x + Math.sin(a) * .3, z0 = z + Math.cos(a) * .3;
        const end = waterPoint(pond, x0 + Math.sin(a) * hop, z0 + Math.cos(a) * hop), h = SPLASH.height[0] + rnd() * (SPLASH.height[1] - SPLASH.height[0]);
        root.add(handle.obj);
        this.flying.push({ handle, t: -i * .12, x0, z0, x1: end.x, z1: end.z, y, h, heading: Math.atan2(end.x - x0, end.z - z0), color: look.water });
        handle.obj.visible = false;
      }
    }
  }
  /** Once a frame (game seconds `dt`). Nothing to do: returns at once. */
  update(dt: number) {
    if (this.queue.length) { const now = this.host.now(); for (let i = this.queue.length - 1; i >= 0; i--) if (this.queue[i].at <= now) { const q = this.queue[i]; this.queue.splice(i, 1); q.run(); } }
    for (let i = this.flying.length - 1; i >= 0; i--) {
      const f = this.flying[i]; f.t += dt / SPLASH.leapTime;
      const o = f.handle.obj; o.visible = f.t > 0; if (f.t <= 0) continue;
      const p = leapAt(f.t, f.x0, f.z0, f.x1, f.z1, f.y, f.h);
      o.position.set(p.x, p.y, p.z); o.rotation.set(-p.pitch, f.heading, Math.sin(f.t * 9) * .25, 'YXZ');
      if (f.handle.tail) f.handle.tail.rotation.y = Math.sin(f.t * 40) * .5;
      if (f.t >= 1) { o.removeFromParent(); this.flying.splice(i, 1); this.host.fx()?.burst({ x: f.x1, z: f.z1 }, { n: 5, color: ['#ffffff', f.color], speed: 2, up: 3, size: .1, life: .45, gravity: 12, y: f.y }); this.host.fx()?.ring({ x: f.x1, z: f.z1 }, { color: '#ffffff', from: .15, to: .8, life: .4, y: f.y, thick: .08, opacity: .7 }); }
    }
  }
  /** A world change: fish in the air drop out, timers forget. */
  clear() { for (const f of this.flying) f.handle.obj.removeFromParent(); this.flying = []; this.queue = []; this.gate.clear(); }
}
