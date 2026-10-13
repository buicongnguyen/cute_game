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
/** The explorer's own walk clock runs at this many radians a second on the default legs (world.ts animatePlayer). */
export const WALK_RATE = 11;
/** The swing (radians) of the longest legs; shorter styles sit between this and the default 0.7. */
const LONG_SWING = .55, LONG_HIP = 1.36;
/**
 * The explorer's own walk fitted to its legs. The default explorer (and anything shorter) keeps its cartoon patter:
 * `rate` 1, `swing` 0.7; its legs are short under a big head and nobody reads the feet. Longer legs are read, so they
 * walk TRUE to the ground: the swing narrows a little as the hips rise, and the step clock is set from the speed the
 * explorer really moves at, so that one step covers one stride (a stride is 2 x hip x scale x sin(swing) metres and a
 * cycle is two of them). Before this the Grown explorer's body covered about three times the ground its steps did.
 * The clock never runs past MAX_RATE (legs would blur), so a very fast explorer on middle-length legs still glides a
 * little. `drop` is how far (model units) the hips sink at full swing, so the standing foot stays on the ground.
 */
export function strideOf(hip: number, speed = 6, scale = .84): { rate: number; swing: number; drop: number } {
  if (!(hip > HIP + .01)) return { rate: 1, swing: .7, drop: 0 };
  const swing = .7 - (.7 - LONG_SWING) * Math.min(1, (hip - HIP) / (LONG_HIP - HIP)), stride = 2 * hip * scale * Math.sin(swing);
  const rate = Math.min(MAX_RATE, Math.max(4, Math.PI * Math.max(0, speed) / stride)) / WALK_RATE;
  return { rate, swing, drop: hip * (1 - Math.cos(swing)) };
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
