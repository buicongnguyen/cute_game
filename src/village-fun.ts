import type * as T from 'three';
import type { Effects } from './fx.ts';

/**
 * Playful answers in the village (owner request 2026-10-16). Nothing can be hurt inside the fence, so a swing or a skill that
 * meets the scenery gets a harmless reaction instead of a dead whiff: a tree shakes and drops a puff of leaves, a fence, stall,
 * bed or decoration gives a small dust bump, a friend or a farm animal sends up a few pink hearts. Ponds splash and fish leap
 * through pond-splash.ts (main.ts calls it first). Looks only: nothing breaks, drops, is saved or is sent.
 *
 * Cheap: particles come from the shared pools (fx.ts), the shake rotates the tree's own group for a moment (no new material,
 * no allocation per frame), and each thing rests POKE.rest s between two answers.
 */
export const POKE = {
  /** Seconds a thing rests between two reactions. */
  rest: .5,
  /** A thing counts when it is in front within this many degrees either side of the facing, or right beside the explorer. */
  cone: 70, beside: .6,
  /** The tree's shake: seconds, the lean (radians) at the start. */
  shake: .5, lean: .09,
} as const;

export type PokeKind = 'tree' | 'bump' | 'happy';
export interface PokeThing { id: string; kind: PokeKind; x: number; z: number; r: number; obj?: T.Object3D }

/** The thing a swing of `reach` m from (x, z) along `facing` touches: the nearest one in front (or right beside), else null. */
export function pokeTarget<P extends PokeThing>(things: readonly P[], x: number, z: number, facing: number, reach: number): P | null {
  const fx = Math.sin(facing), fz = Math.cos(facing), cos = Math.cos(POKE.cone * Math.PI / 180);
  let best: P | null = null, bestD = Infinity;
  for (const t of things) {
    const dx = t.x - x, dz = t.z - z, d = Math.hypot(dx, dz), edge = d - t.r;
    if (edge > reach || edge >= bestD) continue;
    if (edge > POKE.beside && d > 1e-4 && (dx * fx + dz * fz) / d < cos) continue;
    best = t; bestD = edge;
  }
  return best;
}
/** The point of the village fence (a circle of radius `fence` round the centre) nearest to (x, z), when it is within `reach`. */
export function fencePoint(x: number, z: number, fence: number, reach: number): { x: number; z: number } | null {
  const d = Math.hypot(x, z); if (d < 1e-4 || Math.abs(d - fence) > reach) return null;
  return { x: x / d * fence, z: z / d * fence };
}

/** Each thing's rest between two reactions. */
export class PokeGate {
  private last = new Map<string, number>();
  ready(id: string, now: number) { const t = this.last.get(id); if (t !== undefined && now - t < POKE.rest && now >= t) return false; if (this.last.size > 64) this.last.clear(); this.last.set(id, now); return true; }
}

interface Shake { obj: T.Object3D; t: number; ax: number; az: number }
const LEAVES = ['#78ad6a', '#8bbc78', '#a9d27f', '#f3b3c7'], DUST = ['#fff6e0', '#e8d9b8', '#ffffff'], HEARTS = ['#ff80bd', '#ffb3d6', '#ffffff'];

export class VillageFun {
  private gate = new PokeGate(); private shakes: Shake[] = [];
  /** Reactions given (tests, probes). */ count = 0;
  private fx: () => Effects | null; private now: () => number;
  constructor(fx: () => Effects | null, now: () => number) { this.fx = fx; this.now = now; }
  /** Answer a touch on `thing` at its edge facing the explorer at (x, z). Returns false while it rests. */
  poke(thing: PokeThing, x: number, z: number): boolean {
    const fx = this.fx(); if (!fx || !this.gate.ready(thing.id, this.now())) return false;
    this.count++;
    const d = Math.hypot(thing.x - x, thing.z - z) || 1, ux = (thing.x - x) / d, uz = (thing.z - z) / d, at = { x: thing.x - ux * thing.r * .8, z: thing.z - uz * thing.r * .8 };
    if (thing.kind === 'tree') {
      fx.burst({ x: thing.x, z: thing.z }, { n: 12, color: LEAVES, speed: 2.2, up: 1.6, size: .14, life: 1.1, gravity: 3, spread: 3, y: 2.6 });
      if (thing.obj && !this.shakes.some(s => s.obj === thing.obj)) this.shakes.push({ obj: thing.obj, t: 0, ax: uz, az: -ux });
    } else if (thing.kind === 'happy') fx.burst({ x: thing.x, z: thing.z }, { n: 7, color: HEARTS, speed: 1.2, up: 3.2, size: .16, life: .9, gravity: 2, glow: true, y: 1 });
    else fx.burst(at, { n: 6, color: DUST, speed: 1.8, up: 1.8, size: .12, life: .5, gravity: 8, y: .5 });
    return true;
  }
  /** Once a frame: shaking trees sway back to rest. Nothing to do: returns at once. */
  update(dt: number) {
    for (let i = this.shakes.length - 1; i >= 0; i--) {
      const s = this.shakes[i]; s.t += dt / POKE.shake;
      const k = s.t >= 1 ? 0 : Math.sin(s.t * Math.PI * 4) * (1 - s.t) * POKE.lean;
      s.obj.rotation.x = k ? s.ax * k : 0; s.obj.rotation.z = k ? s.az * k : 0;
      if (s.t >= 1) this.shakes.splice(i, 1);
    }
  }
  /** A world change: trees stop where they stand upright. */
  clear() { for (const s of this.shakes) { s.obj.rotation.x = 0; s.obj.rotation.z = 0; } this.shakes.length = 0; }
}
