import type * as T from 'three';
import { stepGait, newGait, type Gait } from './walk-cycle.ts';
import { part } from './part-cache.ts';
import { perfFlags } from './perf-flags.ts';

/**
 * The explorer's base pose (world.ts animatePlayer): the walk and the idle are blended by a gait (walk-cycle.ts: in at
 * 12/s, out at 8/s) instead of switched, so a walk eases in over its first steps and the legs come to rest when it
 * stops. The weapon stance rides the same blend. Then `heroExtras`, once the lazy idle feature
 * (features/hero-idle.ts) has set it, may pose over all of this: the lean into a start and the settle of a stop, the
 * idle fidgets, the sit and the clips. The air, attack, skill, fishing and flight poses of animatePlayer come after.
 * This file is part of the start download and is kept small. No allocation per frame: one HeroMotion per world.
 */
export interface HeroMotion {
  gait: Gait; /** The left leg's swing now (the right is its mirror). */ leg: number;
  /** For animatePlayer: the body's twist, lean, lift and height scale. An extra may change them. */
  twist: number; lean: number; lift: number; sy: number;
}
/** What heroPose reads of the world. */
interface HeroHost { moving?: boolean; walkClock: number; player: T.Object3D; aimT: number; heroMove?: HeroMotion; heroExtras?: (m: HeroMotion, dt: number) => void }

/**
 * Poses the arms, legs and head for this frame and returns the motion with the body's values. `kind` is the weapon in
 * hand ('' in the air, where the stance does not apply).
 * With perfFlags.heroMotion off it is the old switch: the walk or the idle, nothing between, no extras.
 */
export function heroPose(w: HeroHost, dt: number, stride: { swing: number; drop: number }, arm: { swing: number; splay: number; ease: number }, kind: string): HeroMotion {
  const m = w.heroMove ??= { gait: newGait(), leg: 0, twist: 0, lean: 0, lift: 0, sy: 1 }, g = m.gait, on = !!w.moving, smooth = perfFlags.heroMotion, o = w.walkClock, p = w.player;
  if (!smooth) g.blend = +on;
  else { stepGait(g, +on, dt, 1); if (g.blend > .999) g.blend = 1; }
  const b = g.blend, c = Math.sin(o), sway = c * .05 * (1 - b), aim = kind === 'gun' && w.aimT > 0;
  // The legs: straight to the swing while walking; coming to rest no faster than 5.4 rad/s, which is under 0.1 rad a
  // frame at 60 fps on any body height (short legs swing widest).
  const step = on || !smooth ? 9 : 5.4 * dt, leg = m.leg += Math.max(-step, Math.min(step, c * stride.swing * b - m.leg));
  const armL = part(p, 'arm-left'), armR = part(p, 'arm-right');
  armL?.rotation.set((-c * arm.swing - arm.ease) * b, 0, -arm.splay - sway); armR?.rotation.set((c * arm.swing - arm.ease) * b, 0, arm.splay + sway);
  part(p, 'leg-left')?.rotation.set(leg, 0, 0); part(p, 'leg-right')?.rotation.set(-leg, 0, 0);
  part(p, 'head')?.rotation.set(0, Math.sin(o * .4) * .15 * (1 - b), c * .05 * b);
  // The stance of what is in hand: the arm rides the walk, and rests a little higher when standing.
  if (armR) {
    if (aim) { armR.rotation.set(-1.5, 0, .05); armL?.rotation.set(-1.3, 0, .45); }
    else if (kind === 'sword') { armR.rotation.x = -.45 + b * (.15 + c * .3); armR.rotation.z = .18; }
    else if (kind === 'gun') { armR.rotation.x = -.35 + b * (.1 + c * .2); armR.rotation.z = .2; }
    else if (kind === 'rod') armR.rotation.x = -.3 + b * (.1 + c * .2);
  }
  // The hips drop as the legs open (the feet stay on the ground); the body leans into the walk and breathes when standing.
  m.twist = aim ? .12 : 0; m.lean = .1 * b; m.sy = 1 + Math.sin(o * 1.2) * .025 * (1 - b);
  m.lift = -stride.drop * (1 - Math.cos(leg)) / (1 - Math.cos(stride.swing)) * p.scale.y;
  if (smooth) w.heroExtras?.(m, dt);
  return m;
}
