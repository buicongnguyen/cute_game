/**
 * How a body reacts to being hit (creatures and bosses in world.ts updateEnemyVisual, the explorer in animatePlayer):
 * it is knocked back along the blow, squashed, and tipped away, then springs back, all within a sixth of a second.
 *
 * Looks only. The reaction moves, turns and scales the drawn model, which the game sets afresh from the body's real
 * place every frame; the place the rules use (x, z) is never touched, so nothing here can push a body through a wall
 * or out of a hit's reach. A body that is not reacting costs one comparison.
 */
export const REACT = {
  /** Seconds from the blow until the body is back at rest. */
  time: .16,
  /** The part of that time the body takes to reach the far point of the knock. */
  out: .28,
  /** Metres knocked back, the squash (part of its height lost) and the tip away from the blow (rad), for a strength of 1. */
  push: .26, squash: .2, tilt: .26,
  /** A critical and the last hit of a chain hit harder; together never more than `max`. */
  critical: 1.6, big: 1.45, max: 2,
  /** A boss shows this part of it: it still reads as heavy. */
  boss: .4,
  /** The explorer's own reaction to being hurt. */
  hero: .9,
  /** Seconds the world holds still on a critical and on a big hit (never on Battery saver; the longer one wins, they do not add). */
  stopCritical: .06, stopBig: .04,
} as const;

/** How hard a blow shows: 1 for an ordinary hit. */
export function reactStrength(hit: { critical?: boolean; big?: boolean; boss?: boolean }) {
  return Math.min(REACT.max, (hit.critical ? REACT.critical : 1) * (hit.big ? REACT.big : 1)) * (hit.boss ? REACT.boss : 1);
}

/** The world holds still this long for the blow: only for a critical or a big one, and never when `saver` (Battery saver) is on. */
export function reactStop(hit: { critical?: boolean; big?: boolean }, saver: boolean) { return saver ? 0 : hit.critical ? REACT.stopCritical : hit.big ? REACT.stopBig : 0; }

/** 0 at rest, 1 at the far point: out fast, back smoothly, and exactly 0 from `t` = 1 on (and before 0). */
export function reactCurve(t: number) {
  if (!(t > 0) || t >= 1) return 0;
  if (t < REACT.out) { const s = 1 - t / REACT.out; return 1 - s * s; }
  const s = (t - REACT.out) / (1 - REACT.out); return 1 - s * s * (3 - 2 * s);
}

/** A body's reaction in progress: seconds left, its strength, and the way the blow went (unit, on the ground). */
export interface Reaction { left: number; strength: number; x: number; z: number }
export const newReaction = (): Reaction => ({ left: 0, strength: 0, x: 0, z: 1 });

/** Starts (or restarts) the reaction to a blow that travelled along (dx, dz). A blow with no direction knocks straight down: squash only. */
export function startReaction(r: Reaction, dx: number, dz: number, strength: number) {
  const l = Math.hypot(dx, dz);
  r.left = REACT.time; r.strength = Number.isFinite(strength) ? Math.max(0, Math.min(REACT.max, strength)) : 0;
  if (l > 1e-6 && Number.isFinite(l)) { r.x = dx / l; r.z = dz / l; } else { r.x = 0; r.z = 0; }
}

interface Model { position: { x: number; z: number }; rotation: { x: number; y: number; z: number }; scale: { x: number; y: number; z: number } }
/**
 * Steps the reaction by `dt` and adds it to a drawn model that has just been given its rest pose (rotation order YXZ:
 * `rotation.y` is its facing). Returns false once the reaction is over; that last call adds exactly nothing.
 */
export function applyReaction(model: Model, r: Reaction, dt: number) {
  if (!(r.left > 0)) return false;
  r.left = Math.max(0, r.left - (dt > 0 ? dt : 0));
  const k = reactCurve(1 - r.left / REACT.time) * r.strength; if (!(k > 0)) return r.left > 0;
  model.position.x += r.x * REACT.push * k; model.position.z += r.z * REACT.push * k;
  // Tipped away from the blow: split into the model's own forward lean and sideways roll.
  const sin = Math.sin(model.rotation.y), cos = Math.cos(model.rotation.y), ahead = r.x * sin + r.z * cos, side = r.x * cos - r.z * sin;
  model.rotation.x += REACT.tilt * k * ahead; model.rotation.z -= REACT.tilt * k * side;
  const squash = REACT.squash * k;
  model.scale.y *= 1 - squash; model.scale.x *= 1 + squash * .5; model.scale.z *= 1 + squash * .5;
  return r.left > 0;
}
