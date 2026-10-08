/**
 * Small pure feel rules from the October feel pass (tests/feel-rules.test.ts), measured against the reference with
 * clone-reference-app's filmstrip: the harvest's timeline and the crop's flight, hit flashes, the red melee arc a
 * creature shows before it strikes, stacked damage numbers and the skill-name callout.
 */

/**
 * Harvest, after the reference's harvest(): at 0 s a pulse ring on the bed, sparkles and "+1 <crop>"; the crop lifts
 * off and flies in an arc to whoever harvested it (the explorer, or the helper doing the work), shrinking as it goes;
 * "+N XP" pops over the collector just after it lands. The whole beat is about 0.85 s.
 */
export const HARVEST = {
  /** The bed's pulse ring: from .3 to 1.8 m over .4 s, pale gold. */
  ring: { from: .3, to: 1.8, life: .4, color: '#fff5a8' },
  /** Seconds the crop takes to fly to the collector, and how high its arc peaks above the straight line (m). */
  flight: .45, peak: 1.4,
  /** The crop ends at this share of its ripe size. */
  endScale: .3,
  /** "+N XP" shows at the collector this many seconds after the harvest (the reference's 500 ms), with a soft chime. */
  xpDelay: .5,
  /** When the whole beat is over. */
  total: .85,
} as const;
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
/** Ease in-out for the flight's ground track: a quick lift, a soft arrival. */
const ease = (k: number) => k < .5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;
export interface Point3 { x: number; y: number; z: number }
/**
 * Where a harvested crop is `t` seconds after it left its bed, flying from `from` to `to`: the ground track eases
 * along the straight line, a sine arc lifts it up to HARVEST.peak, it shrinks from 1 to HARVEST.endScale and turns.
 * `done` once it has arrived.
 */
export function harvestArc(t: number, from: Point3, to: Point3, out: Point3 & { scale: number; spin: number; done: boolean } = { x: 0, y: 0, z: 0, scale: 1, spin: 1, done: false }) {
  const k = clamp01(t / HARVEST.flight), g = ease(k);
  out.x = from.x + (to.x - from.x) * g; out.z = from.z + (to.z - from.z) * g;
  out.y = from.y + (to.y - from.y) * g + Math.sin(k * Math.PI) * HARVEST.peak;
  out.scale = 1 - (1 - HARVEST.endScale) * k; out.spin = Math.cos(k * Math.PI * 3); out.done = t >= HARVEST.flight;
  return out;
}

/** Hit flashes, after the reference: a struck creature glows white for 0.14 s (titans barely), a hurt explorer glows pink for 0.25 s. */
export const HIT_FLASH = { enemy: .14, white: .7, titan: .15, hero: .25 } as const;
/** The explorer's hurt glow (emissive RGB): warm pink. */
export const HURT_TINT: readonly [number, number, number] = [.95, .32, .55];
/** Emissive strength of a creature's white flash with `left` seconds of it remaining: full, then gone (no fade: it reads as a pop). */
export function enemyFlash(left: number, titan = false) { return left > 0 ? (titan ? HIT_FLASH.titan : HIT_FLASH.white) : 0; }

/**
 * The red arc an ordinary melee creature lays on the ground in front of itself while it winds up: a wedge the size
 * of its real reach (the blow lands within reach + 0.4 m, world.ts), 120° wide, filling from the creature outwards
 * until it strikes. Bosses and the four creature kinds with their own disc (CREATURE_TELEGRAPHS) keep theirs.
 */
export const MELEE_ARC = { half: Math.PI / 3, pad: .4, color: '#ff3b3b' } as const;
export function meleeArc(reach: number) { return { r: Math.max(.8, reach + MELEE_ARC.pad), half: MELEE_ARC.half }; }
/** True when a point lies inside the arc of a creature at (cx, cz) facing `facing` (radians, +z is 0). */
export function inMeleeArc(cx: number, cz: number, facing: number, reach: number, x: number, z: number) {
  const { r, half } = meleeArc(reach), dx = x - cx, dz = z - cz, d = Math.hypot(dx, dz);
  if (d > r) return false; if (d < 1e-6) return true;
  const a = Math.atan2(dx, dz) - facing; return Math.abs(Math.atan2(Math.sin(a), Math.cos(a))) <= half;
}

/** Damage numbers on one creature stack upwards while blows keep landing (a new stack after STACK.gap s), five high. */
export const STACK = { gap: .6, step: .34, max: 5 } as const;
/** The slot of the next number on a creature whose last number was `slot` at `last` (s), now `now`. */
export function nextStackSlot(slot: number, last: number, now: number) { return now - last <= STACK.gap ? (slot + 1) % STACK.max : 0; }
export function stackLift(slot: number) { return slot * STACK.step; }

/** The skill-name callout over the explorer when a skill is cast, in its slot's colour (style.css .float.skillname.s0-s3). */
/** Metres above the floating-text anchor (the explorer's head is at about 1.8 m). */
export const SKILL_NAME_RISE = .9;
