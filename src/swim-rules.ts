/**
 * Crossing water (owner-approved design, Oct 2026): the rules alone, no Three.js, so tests run them directly.
 *
 * A pond (world.ts makePond) is solid up to its sandy lip. Walking into it still stops at the shore; pushing toward the
 * water for HOLD seconds (a held key, a held stick, or a press held on the water) steps in. The rim is shallow (wade,
 * slower); the middle is deep (swim: slower still, no attacks or skills, stamina drains). Out of stamina, the explorer is
 * pulled back to the nearest shore: never drowned, no other penalty. A double or triple jump may cross over the water,
 * and holding a direction while falling over it glides down slowly; landing in deep water starts a swim.
 *
 * Creatures never step in (their scenery keeps the pond solid), so they wait at the shore, and shots fly over water.
 */
export interface Pool { id?: string; x: number; z: number; r: number; /** A pond that must stay a barrier (none today). */ noSwim?: boolean }
export type SwimMode = 'land' | 'wade' | 'swim';

export const SWIM = {
  /** Seconds of pushing toward the water before the explorer steps in. */
  hold: .5,
  /** The pond's collider is its water line plus this (world.ts makePond), and the explorer's clearance is CLEARANCE. */
  lip: .15, clearance: .36,
  /** How far beyond where the explorer stops still counts as "at the shore" (m). */
  shoreReach: .35,
  /** The shallow band inside the water line (m). Small ponds keep at least a deep core of DEEP_CORE of their radius. */
  wadeBand: 1.4, deepCore: .45,
  /** Speed factors in the shallows and swimming. */
  wadeSpeed: .7, swimSpeed: .55,
  /** Seconds of swimming a full stamina lasts, and seconds to refill it in the shallows / on land. */
  swimTime: 18, wadeRefill: 9, landRefill: 4,
  /** How much the push must point into the water (cosine) to count. */
  aim: .55,
  /** A held press on the water steers every 0.2 s (gestures.ts): a target this fresh still counts as held. */
  pressFresh: .45,
  /** Glide: fall speed (m/s) while gliding, and from which jump it is allowed. */
  glideFall: 1.5, glideFrom: 2,
  /** How far outside the water line a glide may already begin (m): the run-up of a jump from the shore. */
  glideApproach: 2.5,
  /** How far the explorer sinks into the water when wading / swimming (m, before the hero's scale). */
  wadeSink: .2, swimSink: .62,
} as const;

/** Where the explorer stops on the shore (distance from the pond's centre). */
export const shoreStop = (pool: Pool) => pool.r + SWIM.lip + SWIM.clearance;
/** Inside this distance from the centre the explorer is in the deep. */
export const deepEdge = (pool: Pool) => Math.max(pool.r * SWIM.deepCore, pool.r - SWIM.wadeBand);

/** The pond the point is in or beside (the nearest by edge distance), and how far past its stop line the point is. */
export function nearestPool(pools: readonly Pool[], x: number, z: number): { pool: Pool; d: number } | null {
  let best: { pool: Pool; d: number } | null = null, gap = Infinity;
  for (const pool of pools) { const d = Math.hypot(x - pool.x, z - pool.z), g = d - pool.r; if (g < gap) { gap = g; best = { pool, d }; } }
  return best;
}

/** What the water is like at a point: land, shallows or deep. `margin` moves the shore line out (leaving needs a step clear of the collider). */
export function modeAt(pools: readonly Pool[], x: number, z: number, margin = 0): { mode: SwimMode; pool: Pool | null } {
  const near = nearestPool(pools, x, z);
  if (!near || near.d >= shoreStop(near.pool) + margin) return { mode: 'land', pool: near?.pool ?? null };
  return { mode: near.d < deepEdge(near.pool) ? 'swim' : 'wade', pool: near.pool };
}

/** The point on the shore nearest to (x, z), just outside where the collider stops the explorer. */
export function shorePoint(pool: Pool, x: number, z: number, extra = .12) {
  const dx = x - pool.x, dz = z - pool.z, d = Math.hypot(dx, dz) || 1, r = shoreStop(pool) + extra;
  return { x: pool.x + dx / d * r, z: pool.z + dz / d * r };
}

/** True when the explorer stands at this pond's shore and the push points into its water. */
export function pushesIn(pool: Pool, x: number, z: number, dirX: number, dirZ: number) {
  const dx = pool.x - x, dz = pool.z - z, d = Math.hypot(dx, dz), n = Math.hypot(dirX, dirZ);
  if (!n || !d || pool.noSwim) return false;
  if (d > shoreStop(pool) + SWIM.shoreReach) return false;
  return (dx * dirX + dz * dirZ) / (d * n) >= SWIM.aim;
}

export interface SwimInput {
  pools: readonly Pool[];
  x: number; z: number;
  /** The explorer's move this frame as pushed (keys or stick), not what it achieved; 0,0 when none. */
  pushX: number; pushZ: number;
  /** A press held on the ground: the world point under it, and how long ago it was refreshed (s). */
  press?: { x: number; z: number; age: number } | null;
  /** The jump: in the air, its jump count, and whether it is falling. */
  air?: { jumps: number; falling: boolean; height: number } | null;
  /** Off for the ocean (its own swimming), indoors, cut-scenes and modes that move the explorer themselves. */
  enabled: boolean;
}
export interface SwimStep {
  /** The explorer may cross pond colliders (in the water, or flying over it on a double jump). */
  pass: boolean;
  mode: SwimMode;
  /** 0..1 progress of the push toward stepping in (for the ring that fills). */
  push: number;
  /** Just stepped in this step: the press target to walk to (if the entry came from a held press). */
  entered: null | { by: 'push' | 'press'; to?: { x: number; z: number } };
  /** Out of stamina: put the explorer here (on the shore). */
  pulled: null | { x: number; z: number };
  /** The jump should glide (fall slowly) now. */
  glide: boolean;
  /** Landed on a pond that may not be swum: put the explorer back on the shore. */
  bounced: null | { x: number; z: number };
}

/** The explorer's water state. One per explorer; `step` runs once per world step. */
export class SwimState {
  mode: SwimMode = 'land';
  /** 0..1. */
  stamina = 1;
  /** Seconds of pushing into the water so far. */
  pushT = 0;
  /** In the water (or allowed into it): pond colliders do not stop the explorer. */
  inside = false;
  /** Seconds since the explorer last swam (for the stamina ring to fade). */
  sinceSwim = 99;
  pool: Pool | null = null;

  reset() { this.mode = 'land'; this.stamina = 1; this.pushT = 0; this.inside = false; this.sinceSwim = 99; this.pool = null; }

  step(dt: number, input: SwimInput): SwimStep {
    const out: SwimStep = { pass: false, mode: 'land', push: 0, entered: null, pulled: null, glide: false, bounced: null };
    if (!input.enabled) { if (this.inside || this.mode !== 'land') this.reset(); out.push = 0; return out; }
    const air = input.air && input.air.jumps > 0 ? input.air : null, { x, z } = input;
    const here = modeAt(input.pools, x, z, this.inside ? .03 : 0);
    // In the air: a double or triple jump may pass over the water; holding a direction while falling over it glides.
    if (air) {
      const near = nearestPool(input.pools, x, z), over = !!near && !near.pool.noSwim && near.d < near.pool.r + SWIM.glideApproach;
      out.pass = this.inside || air.jumps >= SWIM.glideFrom;
      out.glide = air.jumps >= SWIM.glideFrom && air.falling && over && Math.hypot(input.pushX, input.pushZ) > .01;
      this.pushT = 0; out.mode = this.mode; this.pool = here.pool; this.recover(dt);
      return out;
    }
    if (this.inside) {
      // Landing on (or standing in) water that may not be swum sends the explorer to its shore.
      if (here.mode !== 'land' && here.pool?.noSwim) { const p = shorePoint(here.pool, x, z); this.reset(); out.bounced = p; return out; }
      if (here.mode === 'land') { this.inside = false; this.mode = 'land'; }
      else this.mode = here.mode;
    } else if (here.mode !== 'land') {
      // Already in the water without having stepped in: a landing from a jump, a dash, a knock-back. It counts as entered.
      if (here.pool?.noSwim) { out.bounced = shorePoint(here.pool, x, z); return out; }
      this.inside = true; this.mode = here.mode; out.entered = { by: 'push' };
    } else {
      // On land: count the push toward a pond's water, from the keys or stick, or from a press held on the water.
      const pool = here.pool;
      let pushing = false, to: { x: number; z: number } | undefined;
      if (pool && pushesIn(pool, x, z, input.pushX, input.pushZ)) pushing = true;
      const press = input.press;
      if (!pushing && pool && press && press.age <= SWIM.pressFresh) {
        const inWater = Math.hypot(press.x - pool.x, press.z - pool.z) < pool.r;
        if (inWater && pushesIn(pool, x, z, press.x - x, press.z - z)) { pushing = true; to = { x: press.x, z: press.z }; }
      }
      this.pushT = pushing ? this.pushT + dt : 0;
      out.push = Math.min(1, this.pushT / SWIM.hold);
      if (this.pushT >= SWIM.hold) { this.pushT = 0; this.inside = true; this.mode = 'wade'; out.entered = { by: to ? 'press' : 'push', to }; }
    }
    this.pool = here.pool;
    if (this.mode === 'swim') {
      this.sinceSwim = 0; this.stamina = Math.max(0, this.stamina - dt / SWIM.swimTime);
      if (this.stamina <= 0 && here.pool) { out.pulled = shorePoint(here.pool, x, z); this.inside = false; this.mode = 'land'; this.pushT = 0; }
    } else this.recover(dt);
    out.pass = this.inside; out.mode = this.mode;
    return out;
  }
  private recover(dt: number) {
    this.sinceSwim += dt;
    this.stamina = Math.min(1, this.stamina + dt / (this.mode === 'wade' ? SWIM.wadeRefill : SWIM.landRefill));
  }
}

/** Speed factor for a mode. */
export const swimSpeed = (mode: SwimMode) => mode === 'swim' ? SWIM.swimSpeed : mode === 'wade' ? SWIM.wadeSpeed : 1;
/** How far the body sinks for a mode (m, before scale). */
export const swimSink = (mode: SwimMode) => mode === 'swim' ? SWIM.swimSink : mode === 'wade' ? SWIM.wadeSink : 0;
/** Attacks and skills are off while swimming (wading keeps them). */
export const swimBlocksActions = (mode: SwimMode) => mode === 'swim';
/** What other players are told (server-cleaned): only the two water modes, anything else is land. */
export const cleanSwimMode = (value: unknown): SwimMode => value === 'wade' || value === 'swim' ? value : 'land';
