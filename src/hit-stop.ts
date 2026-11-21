/**
 * The feel of a blow that landed (AAA-PLAN WP9): how long the game holds still for it, how hard the camera kicks along
 * it, and how far its sound climbs with the chain. Loaded after Start: features/comfort.ts puts hitFeel on the effects
 * (fx.feel), and main.ts hit() calls it for every blow of the explorer's own. Until then a blow has no stop and no kick.
 */
/**
 * Hit-stop: seconds the game holds still for a blow of the explorer's own. The longest that applies wins;
 * stops never add up. A pet's or a helper's blow stops nothing, and nothing stops on Battery saver. `kill` is the
 * heartbeat a defeat always had. main.ts frame() spends the stop: the rules get no time while effects, shake and
 * floating text run on (and in an online room nothing is held at all). The stop begins once the blow has been drawn
 * (fx.ts posed): what stands still is the swing on its target, not the frame before it.
 */
export const STOP = { light: .035, big: .06, critical: .08, power: .09, break: .11, kill: .05 } as const;
export interface Blow { critical?: boolean; /** The last hit of a chain, a hard knock or a launch. */ big?: boolean; power?: boolean; /** It broke a boss's stagger meter. */ broke?: boolean; kill?: boolean; /** A pet's or a helper's. */ helper?: boolean }
export function hitStop(blow: Blow, saver = false) {
  if (saver || blow.helper) return 0;
  return blow.broke ? STOP.break : blow.power ? STOP.power : blow.critical ? STOP.critical : blow.big ? STOP.big : blow.kill ? STOP.kill : STOP.light;
}
/**
 * The stop budget: in any one second of game time the ordinary stops hold the game for at most `most` seconds (8%),
 * however fast the blows land. A stop that would pass it is shortened; one left shorter than `least` is not worth a
 * frame and is dropped. Plain light hits may use `light` of it: a steady chain stops on each hit, and a little is left
 * for a heavier blow.
 * The signature moments keep their whole length: a stop of `signature` seconds or more (the power strike's hit, a
 * boss's break, a perfect dodge, the Colossus's fall). They are rare, and only one a second is let through like that;
 * a second one inside the same second is an ordinary stop. A signature stop counts against the second like any other,
 * so the hits right after it stop less or not at all.
 */
export const STOP_BUDGET = { window: 1, most: .08, light: .07, least: .012, signature: .09 } as const;
export class StopBudget {
  private at: number[] = []; private held: number[] = [];
  /** The game time of the last signature stop let through whole. */
  private signed = -Infinity;
  /**
   * The part of `seconds` more of stop that may be held at game time `now`; it is then counted. `light`: a plain light
   * hit. `whole`: the stop asked for (it decides the signature class when only what it adds to a running stop is asked).
   */
  grant(seconds: number, now: number, light = false, whole = seconds) {
    let spent = 0;
    for (let i = this.at.length - 1; i >= 0; i--) {
      if (this.at[i] > now || now - this.at[i] >= STOP_BUDGET.window) { this.at.splice(i, 1); this.held.splice(i, 1); } else spent += this.held[i];
    }
    let got = seconds;
    if (whole >= STOP_BUDGET.signature && !(now >= this.signed && now - this.signed < STOP_BUDGET.window)) this.signed = now;
    else got = Math.min(seconds, (light ? STOP_BUDGET.light : STOP_BUDGET.most) - spent);
    if (!(got >= STOP_BUDGET.least)) return 0;
    this.at.push(now); this.held.push(got); return got;
  }
}
/**
 * Puts the budget in front of the effects' freeze (every stop of the game goes through it: a blow's, the power
 * strike's, a perfect dodge's, the Colossus's). A stop asked for while one is being held only counts for what it adds.
 */
export function budgetStops(fx: { hitstop: number; freeze(seconds: number, light?: boolean): void }, now: () => number, budget = new StopBudget()) {
  const freeze = fx.freeze.bind(fx);
  fx.freeze = (seconds, light) => { const held = Math.max(0, fx.hitstop), more = seconds - held; if (more > 0) { const got = budget.grant(more, now(), light, seconds); if (got) freeze(held + got); } };
  return budget;
}

/** The camera's kick for a blow of the explorer's own (shake.ts add: metres at its start), along the blow. */
export const KICK = { light: .08, big: .14, kill: .16, critical: .2, power: .32 } as const;
/** The pitch ladder: each hit of a chain sounds a semitone higher than the one before, up to five; a new chain starts at 0. In cents (sfx.ts detune). */
export const LADDER = { step: 100, cap: 5 } as const;
export const pitchStep = (chain: number) => LADDER.step * Math.max(0, Math.min(LADDER.cap, (Math.floor(chain) || 0) - 1));

/** What the feel of a blow needs of the effects (fx.ts Effects). */
export interface Feel { density: number; freeze(seconds: number, light?: boolean): void; shake(amount: number, dx?: number, dz?: number): void; punch(): void }
/** A blow as the fight tells it (combat.ts CombatHit). */
export interface FeltHit { critical: boolean; knock: number; lift: number; direction: { x: number; z: number }; helper?: boolean; source?: string }
/**
 * The feel of a blow that landed (main.ts hit): the stop, the kick along the blow, and the zoom punch of a power strike
 * and of a boss's break. `chain` is the hit's place in the running chain (0 = none). Returns the cents its sound goes up
 * by. A pet's or a helper's blow has none of it.
 */
export function hitFeel(fx: Feel | undefined, hit: FeltHit, broke: boolean, kill: boolean, chain: number) {
  if (hit.helper || hit.source === 'pet' || hit.source === 'summon') return 0;
  if (fx) {
    const big = hit.knock >= 2 || hit.lift > 0, power = hit.source === 'power';
    const stop = hitStop({ critical: hit.critical, big, power, broke, kill }, fx.density <= .5);
    if (stop) fx.freeze(stop, stop <= STOP.light);
    fx.shake(power ? KICK.power : hit.critical ? KICK.critical : kill ? KICK.kill : big ? KICK.big : KICK.light, hit.direction.x, hit.direction.z);
    if (broke || power) fx.punch();
  }
  return pitchStep(chain);
}
