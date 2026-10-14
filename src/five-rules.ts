/**
 * The five-button fight (docs/FIGHT-PLAN.md section 11): Attack, Jump and three specials. Pure numbers and rules
 * (tests/five-rules.test.ts); combat.ts deals the chain, main.ts reads the presses, promo/fight-sim.mts checks the balance.
 *
 *   - The basic attack is a chain of three: the third press hits hardest and pops small creatures into the air.
 *   - Holding the Attack button keeps attacking; with the power strike charged (power-rules.ts) a hold unleashes it.
 *   - The untouched streak: own hits landed since the explorer was last hurt raise the damage of the next ones a little.
 *
 * Only while the 'Jump and air combat' switch is on and only in solo play: the server's copy of the fight reaches none of it.
 */

// ---------------------------------------------------------------- The three-hit chain

export type ChainKind = 'sword' | 'fist' | 'gun';
export const CHAIN = {
  /**
   * Damage of the three presses as a factor on the explorer's attack. Each row is 90 / 100 / 125% of what one press of
   * that weapon dealt before the chain (a blade 1.1, fists 1 / 1 / 1.5 = 1.167 on average, a gun 1), the shape of the old
   * Strike (80 / 88 / 112%), so three presses deal 5% more than three presses did.
   */
  hits: { sword: [.99, 1.1, 1.375], fist: [1.05, 1.16, 1.46], gun: [.9, 1, 1.25] } as Record<ChainKind, readonly number[]>,
  /** What one press of each weapon dealt on average before the chain. */
  before: { sword: 1.1, fist: 7 / 6, gun: 1 } as Record<ChainKind, number>,
  /** A press later than this after the last one starts the chain again (seconds). */
  reset: 1.2,
  /** How hard each press knocks. */
  knock: [.8, .8, 2.2] as readonly number[],
  /** The third hit of paws or a blade lifts a creature narrower than `small` this high; never a boss, and a gun launches nothing. */
  launch: 1.7, small: 1.2,
  /** A gun's third press is two shots this far apart (seconds), each worth half the press. */
  shots: 2, shotGap: .09,
  /** Each level of the fourth skill ('Attack chain' at the bench) adds this much to the third hit, to Sky Spin and to the weapon's special. */
  perLevel: .08,
} as const;
export const chainKind = (weapon: string): ChainKind => weapon === 'sword' ? 'sword' : weapon === 'gun' ? 'gun' : 'fist';
/** The press after step `last` (-1 = none yet), `since` seconds later: the next of the three, or the first again after a pause. */
export function chainNext(last: number, since: number) { return last >= 0 && last < CHAIN.hits.sword.length - 1 && since >= 0 && since <= CHAIN.reset ? last + 1 : 0; }
/** Damage factor of press `step` (0 to 2) with a weapon of `kind`; `level`: the fourth skill's upgrade level, which raises the third. */
export function chainPower(kind: ChainKind, step: number, level = 0) {
  const hits = CHAIN.hits[kind], i = Math.max(0, Math.min(hits.length - 1, Math.floor(step) || 0));
  return hits[i] * (i === hits.length - 1 ? 1 + CHAIN.perLevel * Math.max(0, Math.min(5, Math.floor(level) || 0)) : 1);
}
/** The third hit of paws or a blade launches ordinary creatures narrower than `small`. */
export function chainLaunches(kind: ChainKind, step: number, target: { boss?: boolean; radius: number }) { return kind !== 'gun' && step === CHAIN.hits[kind].length - 1 && !target.boss && target.radius < CHAIN.small; }
/** Sustained damage of the chain against the basic attack before it (1.05 = five percent more). */
export function chainGain(kind: ChainKind) { const hits = CHAIN.hits[kind]; return hits.reduce((a, b) => a + b, 0) / hits.length / CHAIN.before[kind]; }

// ---------------------------------------------------------------- Hold to unleash

export const HOLD = {
  /** Seconds the Attack button (or key) is held with the charge ready before the power strike goes off. One value. */
  time: .35,
} as const;
/**
 * The Attack button, key or mouse button being held. A press attacks at once (the caller does that on `down`); after it
 * `step` says what the hold does: 'repeat' (keep attacking at the weapon's pace) while there is no charge, 'fill' while a
 * ready charge is being held, and 'power' once it has been held HOLD.time. Releasing, or a finger that slides off, ends
 * it, so a tap of any speed can never unleash the strike.
 */
export class AttackHold {
  private sources = new Set<string>(); private filled = 0;
  get held() { return this.sources.size > 0; }
  /** 0 to 1: how far the hold has come (the radial fill on the pad). */
  get fill() { return Math.min(1, this.filled / HOLD.time); }
  /** A key, a finger or the mouse went down. True when nothing was holding before (so this press attacks). */
  down(source: string) { const first = !this.sources.size; this.sources.add(source); if (first) this.filled = 0; return first; }
  /** It was released, or slid off the button. */
  up(source: string) { this.sources.delete(source); if (!this.sources.size) this.filled = 0; }
  has(source: string) { return this.sources.has(source); }
  /** Nothing but `source` is holding. */
  only(source: string) { return this.sources.size === 1 && this.sources.has(source); }
  clear() { this.sources.clear(); this.filled = 0; }
  /** Every step. `ready`: a power strike is charged and may be used now. */
  step(dt: number, ready: boolean): 'power' | 'fill' | 'repeat' | null {
    if (!this.sources.size) { this.filled = 0; return null; }
    if (!ready) { this.filled = 0; return 'repeat'; }
    if (dt > 0) this.filled += dt;
    return this.filled >= HOLD.time ? 'power' : 'fill';
  }
  /** The strike went off: the fill starts again (the button may still be held, and then goes on attacking). */
  spent() { this.filled = 0; }
}

// ---------------------------------------------------------------- The untouched streak

export const STREAK = {
  /** Each own hit landed since the explorer was last hurt adds this much damage to the next, up to `max`. */
  step: .015, max: .3,
  /** With no hit landed for this many seconds the streak is dropped. */
  idle: 20,
  /** The streak is called out at these counts. */
  milestones: [10, 20, 30] as readonly number[],
} as const;
/**
 * Own hits landed since the explorer last took damage. It is not timed like the chain: it lasts through the pauses of a
 * fight and from one creature to the next, falls to nothing the moment the explorer is hurt or knocked out, and is dropped
 * after STREAK.idle seconds without a hit. A dodge, a block or a blow that does no damage does not break it.
 */
export class UntouchedStreak {
  count = 0; private idle = 0;
  /** Damage factor for the next own hit. */
  get bonus() { return 1 + Math.min(STREAK.max, STREAK.step * this.count); }
  /** The bonus in whole and half percent, for the counter ('+7.5%' is shown as 7.5). */
  get percent() { return Math.round((this.bonus - 1) * 1000) / 10; }
  /** One of the explorer's own hits landed (a pet's does not count). Returns the milestone just reached, or 0. */
  hit(): number { this.count++; this.idle = 0; return STREAK.milestones.includes(this.count) ? this.count : 0; }
  /** The explorer took `damage`. Returns the streak that was lost (0 when nothing broke: no damage, or no streak). */
  hurt(damage: number): number { if (!(damage > 0)) return 0; const lost = this.count; this.count = 0; this.idle = 0; return lost; }
  /** Time passes. Returns true when the streak has just been dropped for idling. */
  step(dt: number): boolean { if (!(dt > 0) || !this.count) return false; this.idle += dt; if (this.idle < STREAK.idle) return false; this.count = 0; this.idle = 0; return true; }
  /** Knocked out, or the fight is reset. */
  clear() { this.count = 0; this.idle = 0; }
}

// ---------------------------------------------------------------- The paw: where the buttons sit on a touch screen

/**
 * The paw of a touch screen, in pixels from the Attack pad's centre (x towards the screen's middle, y up), for a skill
 * size `sk` (the --sk of hud-compact.css). hud-ours.css draws exactly this (tests/five-rules.test.ts reads both); the
 * layout test lays a thumb over it. Attack is the big pad by the corner, Jump stands beside it on the inner side, and the
 * three specials sit on an arc above them, out from under a thumb that rests on either; a disguise's fourth skill is a
 * crown over the arc.
 */
export const PAW = {
  /** Sizes in skill widths, and the least each may be in pixels. */
  pad: 1.3, padMin: 60, jump: 1.08, jumpMin: 52, toe: 1.08, toeMin: 48,
  /** Jump's centre from the Attack pad's centre, in skill widths: beside it on the inner side, a little lower. */
  jumpAt: [1.5, -.11] as readonly [number, number],
  /** The arc of the three specials: its centre from the Attack pad's centre and its radius, in skill widths; the toes' angles in degrees (0 = inwards, 90 = up), the outer toe first. */
  arcAt: [.7, .22] as readonly [number, number], radius: 1.93, angles: [119, 80.5, 42] as readonly number[],
  /** A disguise's fourth skill: one more toe as a crown over the two inner toes of the arc, so the three keep their places. */
  crown: [2.089, 2.75] as readonly [number, number],
  /** A thumb: a capsule this wide (22 mm, about 100 CSS px on a phone) from the screen's bottom corner to the button it rests on. */
  thumb: 100,
} as const;
export interface PawSpot { x: number; y: number; size: number }
/** The toes' centres in skill widths from the Attack pad's centre, rounded as hud-ours.css writes them (--x, --y): the arc from the outer toe to the inner one, then the crown when there are four. */
export function pawToes(toes: 3 | 4 = 3): [number, number][] {
  const round = (v: number) => Math.round(v * 1000) / 1000;
  const arc = PAW.angles.map(deg => [round(PAW.arcAt[0] + Math.cos(deg * Math.PI / 180) * PAW.radius), round(PAW.arcAt[1] + Math.sin(deg * Math.PI / 180) * PAW.radius)] as [number, number]);
  return toes === 4 ? [...arc, [PAW.crown[0], PAW.crown[1]]] : arc;
}
/** The buttons of the paw for a skill size: Attack at the origin, Jump, and the toes from the outer one (by the screen's edge) to the inner one, then the crown. */
export function pawLayout(sk: number, toes: 3 | 4 = 3): { attack: PawSpot; jump: PawSpot; toes: PawSpot[] } {
  const size = Math.max(PAW.toeMin, PAW.toe * sk);
  return {
    attack: { x: 0, y: 0, size: Math.max(PAW.padMin, PAW.pad * sk) },
    jump: { x: PAW.jumpAt[0] * sk, y: PAW.jumpAt[1] * sk, size: Math.max(PAW.jumpMin, PAW.jump * sk) },
    toes: pawToes(toes).map(([x, y]) => ({ x: x * sk, y: y * sk, size })),
  };
}
/** Distance from a point to the segment a-b. */
function toSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
  const dx = bx - ax, dy = by - ay, l = dx * dx + dy * dy, f = l ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l)) : 0;
  return Math.hypot(px - ax - dx * f, py - ay - dy * f);
}
/**
 * Pixels of clear screen between a round button (centre and size) and a thumb that comes from `corner` and rests on
 * `on`: negative when the thumb covers part of it. All in one coordinate system (screen pixels, or the paw's own).
 */
export function thumbClear(button: PawSpot, corner: { x: number; y: number }, on: { x: number; y: number }, thumb: number = PAW.thumb) {
  return toSegment(button.x, button.y, corner.x, corner.y, on.x, on.y) - thumb / 2 - button.size / 2;
}
