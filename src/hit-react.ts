/**
 * How a body reacts to being hit (creatures and bosses in world.ts updateEnemyVisual, the explorer in animatePlayer,
 * the Rescue Call's instanced raiders in rescue-view.ts, the Colossus in colossus.ts, Flag Rush heroes in world.ts animateRemotes):
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
  /** A boss shows this part of it: it still reads as heavy. A titan (a boss many metres tall) shows this part of a boss's. */
  boss: .4, titan: .4,
  /** A boss is not moved at all: it staggers where it stands, tipped this far away from the blow (rad, for a strength of 1). */
  stagger: .55,
  /** The explorer's own reaction to being hurt. */
  hero: .9,
  /** Seconds the world holds still on a critical and on a big hit (never on Battery saver; the longer one wins, they do not add). */
  stopCritical: .06, stopBig: .04,
} as const;

/** How hard a blow shows: 1 for an ordinary hit. */
export function reactStrength(hit: { critical?: boolean; big?: boolean; boss?: boolean; titan?: boolean }) {
  return Math.min(REACT.max, (hit.critical ? REACT.critical : 1) * (hit.big ? REACT.big : 1)) * (hit.boss || hit.titan ? REACT.boss : 1) * (hit.titan ? REACT.titan : 1);
}

/** The world holds still this long for the blow: only for a critical or a big one, and never when `saver` (Battery saver) is on. */
export function reactStop(hit: { critical?: boolean; big?: boolean }, saver: boolean) { return saver ? 0 : hit.critical ? REACT.stopCritical : hit.big ? REACT.stopBig : 0; }

/** 0 at rest, 1 at the far point: out fast, back smoothly, and exactly 0 from `t` = 1 on (and before 0). */
export function reactCurve(t: number) {
  if (!(t > 0) || t >= 1) return 0;
  if (t < REACT.out) { const s = 1 - t / REACT.out; return 1 - s * s; }
  const s = (t - REACT.out) / (1 - REACT.out); return 1 - s * s * (3 - 2 * s);
}

/** A body's reaction in progress: seconds left, its strength, the way the blow went (unit, on the ground), and whether the body stays where it stands (a boss staggers). */
export interface Reaction { left: number; strength: number; x: number; z: number; still?: boolean }
export const newReaction = (): Reaction => ({ left: 0, strength: 0, x: 0, z: 1, still: false });

/**
 * Starts (or restarts) the reaction to a blow that travelled along (dx, dz). A blow with no direction knocks straight
 * down: squash only. `still`: the body is not pushed, it tips further instead (a boss).
 */
export function startReaction(r: Reaction, dx: number, dz: number, strength: number, still = false) {
  const l = Math.hypot(dx, dz); r.still = still;
  r.left = REACT.time; r.strength = Number.isFinite(strength) ? Math.max(0, Math.min(REACT.max, strength)) : 0;
  if (l > 1e-6 && Number.isFinite(l)) { r.x = dx / l; r.z = dz / l; } else { r.x = 0; r.z = 0; }
}

/** What a reaction adds to a body right now: metres along x and z, the tip forward and sideways (rad, in the body's own space) and the squash (the part of its height lost). */
export interface ReactionPose { x: number; z: number; lean: number; roll: number; squash: number }
export const newReactionPose = (): ReactionPose => ({ x: 0, z: 0, lean: 0, roll: 0, squash: 0 });
/**
 * Steps the reaction by `dt` and writes what it adds to a body facing `facing` into `out`: for bodies that are not
 * drawn as one model whose pose can be added to (instanced raiders compose it into their matrix). Returns false once
 * the reaction is over; `out` is then all zero.
 */
export function reactionPose(r: Reaction, dt: number, facing: number, out: ReactionPose) {
  out.x = out.z = out.lean = out.roll = out.squash = 0;
  if (!(r.left > 0)) return false;
  r.left = Math.max(0, r.left - (dt > 0 ? dt : 0));
  const k = reactCurve(1 - r.left / REACT.time) * r.strength; if (!(k > 0)) return r.left > 0;
  if (!r.still) { out.x = r.x * REACT.push * k; out.z = r.z * REACT.push * k; }
  // Tipped away from the blow: split into the body's own forward lean and sideways roll.
  const sin = Math.sin(facing), cos = Math.cos(facing), ahead = r.x * sin + r.z * cos, side = r.x * cos - r.z * sin, tilt = (r.still ? REACT.stagger : REACT.tilt) * k;
  out.lean = tilt * ahead; out.roll = -tilt * side; out.squash = REACT.squash * k;
  return r.left > 0;
}

const POSE = newReactionPose();
interface Model { position: { x: number; z: number }; rotation: { x: number; y: number; z: number }; scale: { x: number; y: number; z: number } }
/**
 * Steps the reaction by `dt` and adds it to a drawn model that has just been given its rest pose (rotation order YXZ:
 * `rotation.y` is its facing). Returns false once the reaction is over; that last call adds exactly nothing.
 */
export function applyReaction(model: Model, r: Reaction, dt: number) {
  if (!(r.left > 0)) return false;
  const live = reactionPose(r, dt, model.rotation.y, POSE);
  model.position.x += POSE.x; model.position.z += POSE.z; model.rotation.x += POSE.lean; model.rotation.z += POSE.roll;
  model.scale.y *= 1 - POSE.squash; model.scale.x *= 1 + POSE.squash * .5; model.scale.z *= 1 + POSE.squash * .5;
  return live;
}
