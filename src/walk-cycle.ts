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
export interface Limbs { legL: T.Object3D | null; legR: T.Object3D | null; armL: T.Object3D | null; armR: T.Object3D | null; /** How far under the shoulder the hand closes (model units); missing = the default arm. */ arm?: number }
/** The default arm: its hand closes this far under the shoulder (hero_spec: shoulder 1.08, hand 0.72). */
export const ARM = .36;
/** The swing (radians) and the outward splay of the longest arm (the Grown height, hand 0.745 under the shoulder). */
const LONG_ARM = .745, LONG_ARM_SWING = .42, LONG_ARM_SPLAY = .2;
/**
 * The arms fitted to their length, as the legs are to theirs. The default explorer keeps its cartoon swing (0.8 rad,
 * splayed 0.3): its arm is a stub and the hand travels a hand's width. The same angle on the Grown arm, twice as long,
 * threw the hand from in front of the face to behind the back; a longer arm swings through a smaller angle (so the
 * hand covers about the same ground as before), hangs closer to the body, and rests a little forward of the hip while
 * walking (`ease`, radians: no elbow, so the whole arm leans). `drop` is the hand's distance under the shoulder.
 */
export function armSwing(drop = ARM): { swing: number; splay: number; ease: number } {
  if (!(drop > ARM + .01)) return { swing: .8, splay: .3, ease: 0 };
  const k = Math.min(1, (drop - ARM) / (LONG_ARM - ARM));
  return { swing: .8 - (.8 - LONG_ARM_SWING) * k, splay: .3 - (.3 - LONG_ARM_SPLAY) * k, ease: .1 * k };
}
/** The arm length of a model built from the hero's parts: its hand marker under the shoulder pivot (the default without one). */
export function armOf(model: T.Object3D | null | undefined): number { return model ? limbsOf(model).arm ?? ARM : ARM; }
/** The model's leg and arm pivots (the hero's named parts), found once. */
export function limbsOf(model: T.Object3D): Limbs {
  const cached = model.userData.limbs as Limbs | undefined; if (cached) return cached;
  const limbs: Limbs = { legL: model.getObjectByName('leg-left') ?? null, legR: model.getObjectByName('leg-right') ?? null, armL: model.getObjectByName('arm-left') ?? null, armR: model.getObjectByName('arm-right') ?? null };
  const hand = limbs.armR?.getObjectByName('hand-right') ?? limbs.armL?.getObjectByName('hand-left'); if (hand && hand.position.y < -.2) limbs.arm = -hand.position.y;
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
/** Distance-matched steps for every height; short cartoon legs may patter faster than long legs. */
export function strideOf(hip: number, speed = 6, scale = .84): { rate: number; swing: number; drop: number } {
  const leg = Math.max(.2, hip), k = Math.max(0, Math.min(1, (leg - HIP) / (LONG_HIP - HIP)));
  const swing = .7 + Math.max(0, Math.min(.3, (HIP - leg) * 2)) - (.7 - LONG_SWING) * k, stride = 2 * leg * Math.max(.1, scale) * Math.sin(swing);
  const limit = MAX_RATE + (1 - k) * 18;
  const rate = Math.min(limit, Math.PI * Math.max(0, speed) / stride) / WALK_RATE;
  return { rate, swing, drop: leg * (1 - Math.cos(swing)) };
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
  // The arms counter-swing 1.1 x the legs on the default arm; a longer arm swings less and leans a little forward (armSwing).
  const a = arms && l.arm ? armSwing(l.arm) : null, arm = a ? s * 1.1 * a.swing / .8 : s * 1.1, ease = a ? a.ease : 0;
  if (arms && l.armL) l.armL.rotation.x = l.armL.rotation.x * k + (-arm - ease) * b;
  if (arms && l.armR) l.armR.rotation.x = l.armR.rotation.x * k + (arm - ease) * b;
  return Math.abs(Math.cos(g.phase)) * .06 * b;
}
