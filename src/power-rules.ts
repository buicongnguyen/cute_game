/**
 * The power strike: landing hits fills a charge, a full charge makes the Attack button glow, and holding it (five-rules.ts
 * HOLD) unleashes one big move that suits the weapon in hand. Pure numbers and rules (tests/power-rules.test.ts); combat.ts deals the damage,
 * main.ts counts the hits and shows the button, power-fx.ts draws it, promo/fight-sim.mts checks the balance.
 *
 * Only while the 'Jump and air combat' switch is on and only in solo play: the server's copy of the fight never
 * reaches any of this.
 */

export const POWER = {
  /** Own hits on creatures that fill one level of the charge (pets, the dog and summons do not count). */
  need: 20,
  /** Levels the charge can reach: the second (twice the hits) is the overcharge, shown as x2 on the button. */
  levels: 2,
  /** Seconds a ready charge waits for the press; it blinks through the last `blink` of them. */
  keep: 12, blink: 3,
  /** Unused, the charge falls to this share of one level and has to be filled again. */
  lapse: .5,
  /** Damage of the strike in basic hits, by level: all of it on one creature, shared out among several. */
  power: [5, 8.5] as readonly number[],
  /** However many share it, no creature in the area takes less than this (in basic hits), by level. */
  floor: [1.25, 2] as readonly number[],
  /** One strike never takes more than this share of a boss's full health (the boss single-hit cap of docs/FIGHT-PLAN.md). */
  bossCap: .15,
  /** The wind-up before it lands (short: holding Attack for HOLD.time is the real wind-up), the hit-stop when it does, and how long the hands stay busy after. */
  windup: .1, stop: .09, recovery: .3,
  /** What it does to the creatures it hits: a short stun, a hard knock, a small lift for ordinary creatures. */
  stun: .3, knock: 4.5, lift: 1.2,
} as const;

/** The four forms: a blade's travelling crescent, the fists' gust in a cone, a gun's beam, and the ring of the dive version. */
export type PowerShape = 'wave' | 'cone' | 'beam' | 'ring';
export interface PowerArea {
  shape: PowerShape;
  /** wave, beam: metres ahead and half the width. cone, ring: the radius. */
  length: number; half: number; radius: number;
  /** cone: cosine of the half angle. */
  cone: number;
  /** wave: metres a second it travels (a creature is hit when the wave reaches it); 0 = at once. */
  speed: number;
}
/** One table: the area of each form at level 1; level 2 is `grow` times as large. What is drawn is exactly what hits. */
export const POWER_AREAS: Record<PowerShape, PowerArea> = {
  wave: { shape: 'wave', length: 7, half: 1.6, radius: 0, cone: 0, speed: 26 },
  cone: { shape: 'cone', length: 0, half: 0, radius: 4.6, cone: .64, speed: 0 },
  beam: { shape: 'beam', length: 11, half: .75, radius: 0, cone: 0, speed: 0 },
  ring: { shape: 'ring', length: 0, half: 0, radius: 4, cone: 0, speed: 0 },
};
export const POWER_GROW = 1.25;

/** The form for the weapon that fights (the one in hand, else the disguise's own); in the air every weapon comes down as the ring. */
export function powerShape(kind: string, air = false): PowerShape { return air ? 'ring' : kind === 'sword' ? 'wave' : kind === 'gun' ? 'beam' : 'cone'; }
const level01 = (level: number) => Math.max(1, Math.min(POWER.levels, Math.floor(level) || 1));
/** The area of a form at a level. */
export function powerArea(shape: PowerShape, level = 1): PowerArea {
  const a = POWER_AREAS[shape], k = level01(level) > 1 ? POWER_GROW : 1;
  return { ...a, length: a.length * k, half: a.half * k, radius: a.radius * k };
}
export interface PowerPoint { x: number; z: number }
/**
 * Is a creature in the strike's area? Returns how far along it is (metres from the explorer: a wave reaches it after
 * that distance), or -1 when it is outside. A body counts when any part of it is inside.
 */
export function powerReach(shape: PowerShape, level: number, from: PowerPoint, facing: number, target: PowerPoint & { radius: number }): number {
  const a = powerArea(shape, level), dx = target.x - from.x, dz = target.z - from.z, d = Math.hypot(dx, dz), sin = Math.sin(facing), cos = Math.cos(facing);
  const along = dx * sin + dz * cos, side = Math.abs(dx * cos - dz * sin), r = Math.max(0, target.radius);
  if (shape === 'ring') return d <= a.radius + r ? d : -1;
  if (shape === 'cone') { if (d > a.radius + r) return -1; if (d <= r) return d; return Math.acos(Math.max(-1, Math.min(1, along / d))) <= Math.acos(a.cone) + Math.asin(Math.min(1, r / d)) ? d : -1; }
  return along >= -r && along <= a.length + r && side <= a.half + r ? Math.max(0, along) : -1;
}
/** Damage factor (in basic hits) each of `targets` creatures takes: the whole strike on one, shared among several, never under the floor. */
export function powerShare(level: number, targets: number): number {
  const i = level01(level) - 1, n = Math.max(1, Math.floor(targets) || 1);
  return Math.max(POWER.power[i] / n, POWER.floor[i]);
}
/** The most one strike may take from a creature: `bossCap` of a boss's full health, anything from the others. */
export function powerCap(target: { boss?: boolean; maxHp?: number }) { return target.boss && target.maxHp ? Math.max(1, Math.round(target.maxHp * POWER.bossCap)) : Infinity; }
/** Seconds after the press at which a creature `along` metres away is hit. */
export function powerDelay(shape: PowerShape, along: number) { const s = POWER_AREAS[shape].speed; return s > 0 ? Math.max(0, along) / s : 0; }

export interface PowerView { /** 0 = filling, 1 = ready, 2 = overcharged. */ level: number; /** 0 to 1 towards the next level (1 at the top). */ progress: number; hits: number; /** Ready and in its last seconds. */ blinking: boolean; left: number }
/** The charge: hits fill it, a level waits `keep` seconds for the press, and unused it falls back to half. */
export class PowerCharge {
  hits = 0;
  /** Seconds the ready charge still waits. */
  left = 0;
  get level() { return Math.min(POWER.levels, Math.floor(this.hits / POWER.need)); }
  /** One of the explorer's own hits landed on a creature. Returns the level it has just reached, or 0. */
  hit(): number {
    const cap = POWER.need * POWER.levels; if (this.hits >= cap) return 0;
    const before = this.level; this.hits++;
    if (this.level > before) { this.left = POWER.keep; return this.level; }
    return 0;
  }
  /** Time passes: a ready charge that is not used falls to `lapse` of one level. Returns true when it just lapsed. */
  step(dt: number): boolean {
    if (!(dt > 0) || !this.level) return false;
    this.left -= dt; if (this.left > 0) return false;
    this.hits = Math.floor(POWER.need * POWER.lapse); this.left = 0; return true;
  }
  /** The press: returns the level spent (0 = not ready) and starts again from nothing. */
  use(): number { const level = this.level; if (level) { this.hits = 0; this.left = 0; } return level; }
  /** Knocked out, or the fight is reset: the charge is gone. */
  clear() { this.hits = 0; this.left = 0; }
  view(): PowerView {
    const level = this.level, top = level >= POWER.levels;
    return { level, hits: this.hits, progress: top ? 1 : (this.hits - level * POWER.need) / POWER.need, blinking: level > 0 && this.left <= POWER.blink, left: level ? Math.max(0, this.left) : 0 };
  }
}
