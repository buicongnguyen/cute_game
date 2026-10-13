import type * as T from 'three';

/**
 * A shared walk cycle for anything built from the hero's parts (friends indoors and outdoors, online explorers):
 * legs swing about the hips and the arms counter-swing, the cadence follows the ground actually covered (so feet do
 * not skate), the swing grows a little with speed, and a blend fades the cycle in when walking starts and out when the
 * walker stops or sits. No allocation per frame: the limb nodes are looked up once and cached on the model.
 */
export interface Gait { phase: number; blend: number }
/** The hero's hip height in model units (hero_spec.PIVOTS: hips at 0.52). */
export const HIP = .52;
/** Fastest cadence (radians a second): beyond about three steps a second a small walker reads as a blur, not legs. */
const MAX_RATE = 18;
export const newGait = (): Gait => ({ phase: 0, blend: 0 });
/**
 * Advances a gait by the distance covered this frame. `leg` is the walker's hip height in metres (HIP x its scale).
 * One step per about 1.1 leg lengths, so a bigger walker steps slower for the same speed.
 */
export function stepGait(g: Gait, dist: number, dt: number, leg: number) {
  const moving = dist > dt * .05;
  if (moving) g.phase = (g.phase + Math.min(dist / (leg * 1.1) * Math.PI, MAX_RATE * dt)) % (Math.PI * 2);
  g.blend += ((moving ? 1 : 0) - g.blend) * (1 - Math.exp(-dt * (moving ? 12 : 8)));
  if (!moving && g.blend < .01) g.blend = 0;
  return g;
}
/** The swing amplitude (radians) at a speed: 0.45 at a stroll up to 0.8 at a run. */
export const gaitSwing = (speed: number, leg: number) => Math.min(.8, .45 + speed / leg * .02);
export interface Limbs { legL: T.Object3D | null; legR: T.Object3D | null; armL: T.Object3D | null; armR: T.Object3D | null }
/** The model's leg and arm pivots (the hero's named parts), found once. */
export function limbsOf(model: T.Object3D): Limbs {
  const cached = model.userData.limbs as Limbs | undefined; if (cached) return cached;
  const limbs = { legL: model.getObjectByName('leg-left') ?? null, legR: model.getObjectByName('leg-right') ?? null, armL: model.getObjectByName('arm-left') ?? null, armR: model.getObjectByName('arm-right') ?? null };
  model.userData.limbs = limbs; return limbs;
}
/**
 * The hip height (model units) of a model built from the hero's parts: its leg pivot, so a longer-legged body style
 * (the Tall and Grown heights) is known without a table. A stand-in without real hips counts as the default explorer.
 */
export function hipOf(model: T.Object3D | null | undefined): number {
  if (!model) return HIP;
  const y = limbsOf(model).legL?.position.y ?? 0; return y > .2 ? y : HIP;
}
/**
 * The explorer's own clock-driven walk fitted to its legs: `rate` slows the step clock and `swing` (radians) narrows
 * the leg swing as the hips rise. Speed is the same at every height, so the cadence times the stride must stay what it
 * is for the default explorer: a leg k squared times longer takes steps k times longer, k times less often. Before, a
 * Grown explorer swung its long legs 0.7 rad at the chibi's cadence: feet two metres apart, both off the ground.
 */
export function strideOf(hip: number): { rate: number; swing: number } {
  if (!(hip > HIP + .01)) return { rate: 1, swing: .7 };
  const k = Math.sqrt(hip / HIP); return { rate: 1 / k, swing: Math.asin(Math.min(1, Math.sin(.7) * k * HIP / hip)) };
}
/**
 * Blends the walk swing over whatever pose the limbs already hold (x rotations only; an arm's splay on z is kept).
 * Returns the body bob (model units) to add to the walker's height. Pass arms = false to leave the arms to a pose.
 */
export function applyGait(l: Limbs, g: Gait, swing: number, arms = true) {
  if (g.blend <= 0) return 0;
  const s = Math.sin(g.phase) * swing, b = g.blend, k = 1 - b;
  if (l.legL) l.legL.rotation.x = l.legL.rotation.x * k + s * b;
  if (l.legR) l.legR.rotation.x = l.legR.rotation.x * k - s * b;
  if (arms && l.armL) l.armL.rotation.x = l.armL.rotation.x * k - s * 1.1 * b;
  if (arms && l.armR) l.armR.rotation.x = l.armR.rotation.x * k + s * 1.1 * b;
  return Math.abs(Math.cos(g.phase)) * .06 * b;
}
