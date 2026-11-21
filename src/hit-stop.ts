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
/** The camera's kick for a blow of the explorer's own (shake.ts add: metres at its start), along the blow. */
export const KICK = { light: .08, big: .14, kill: .16, critical: .2, power: .32 } as const;
/** The pitch ladder: each hit of a chain sounds a semitone higher than the one before, up to five; a new chain starts at 0. In cents (sfx.ts detune). */
export const LADDER = { step: 100, cap: 5 } as const;
export const pitchStep = (chain: number) => LADDER.step * Math.max(0, Math.min(LADDER.cap, (Math.floor(chain) || 0) - 1));

/** What the feel of a blow needs of the effects (fx.ts Effects). */
export interface Feel { density: number; freeze(seconds: number): void; shake(amount: number, dx?: number, dz?: number): void; punch(): void }
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
    fx.freeze(hitStop({ critical: hit.critical, big, power, broke, kill }, fx.density <= .5));
    fx.shake(power ? KICK.power : hit.critical ? KICK.critical : kill ? KICK.kill : big ? KICK.big : KICK.light, hit.direction.x, hit.direction.z);
    if (broke || power) fx.punch();
  }
  return pitchStep(chain);
}
