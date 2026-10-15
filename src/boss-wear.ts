/**
 * Cute boss wear (FEEL pass, 2026-10-15): a boss shows the fight on its body in a toon way, never gore. At 75%, 50% and
 * 25% health it gets one more stage: a bump and a sticking plaster first, then another plaster and a chip of itself (a
 * piece of bark, a tusk tip, a scale, a crumb, a crown jewel) popping off and bouncing away while sweat drops start to
 * fly, then a criss-cross plaster, a second bump, another chip and more sweat. Enraged (below 30%) it puffs steam (or
 * sparks, for the hot and the mechanical) now and then. A boss that heals or respawns is clean again.
 *
 * Rules only; boss-wear-view.ts draws them (one small instanced batch per shape, hidden when empty, colours per instance:
 * no material is made or swapped during a fight).
 */
/** Health shares at which the next stage starts. */
export const WEAR_STEPS = [.75, .5, .25] as const;
/** 0 (unhurt) to 3 (a quarter of its health or less). A dead or unknown boss is 0, so a respawn is clean. */
export function wearStage(hp: number, maxHp: number): 0 | 1 | 2 | 3 {
  if (!(maxHp > 0) || !(hp > 0)) return 0;
  const f = hp / maxHp; return f <= WEAR_STEPS[2] ? 3 : f <= WEAR_STEPS[1] ? 2 : f <= WEAR_STEPS[0] ? 1 : 0;
}
export type WearShape = 'bump' | 'plaster' | 'cross';
/** What each stage sticks on: [stage, shape, angle round the body from the side the camera sees (rad), height share]. */
export const WEAR_PIECES: ReadonlyArray<readonly [1 | 2 | 3, WearShape, number, number]> = [
  [1, 'bump', .45, .9], [1, 'plaster', -.55, .68],
  [2, 'plaster', .95, .5],
  [3, 'cross', -.15, .8], [3, 'bump', -.75, .93],
];
/** Stages that pop a chip off, and seconds between sweat drops at each stage (none before stage 2). */
export const WEAR_CHIP_STAGES: ReadonlySet<number> = new Set([2, 3]);
export const SWEAT_GAP = [Infinity, Infinity, 1.5, .8] as const;
/** Seconds between puffs while enraged. */
export const ENRAGE_PUFF = 1.4;
export const WEAR_COLORS = { bump: '#ff9db5', plaster: '#ffe2b8', sweat: '#9fe3ff', star: '#ffe14d', crown: '#ffd23f' } as const;
/** Bosses with a crown: their second chip is a jewel from it. */
const CROWNED: ReadonlySet<string> = new Set(['bear', 'croc', 'mushking', 'cake', 'jellyqueen']);
const HOT: ReadonlySet<string> = new Set(['golem', 'dragon', 'robot', 'phoenix']);
const CHIP_OF: Readonly<Record<string, string>> = {
  treant: '#8a5a3b', mammoth: '#fff3dc', croc: '#2f7a40', cake: '#ffffff', gingerbread: '#e7a15d', golem: '#3c3340',
  robot: '#b9c3cf', dragon: '#b52e27', leviathan: '#3b5f97', shadowlord: '#be91e6', mushking: '#fff1cf',
};
export interface WearLook { chips: readonly [string, string]; puff: 'steam' | 'sparks' }
/** A boss's chips (one per chip stage) and its enraged puff. */
export function wearLook(type: string | undefined, color: string, accent: string): WearLook {
  const own = (type && CHIP_OF[type]) || color;
  return { chips: [own, type && CROWNED.has(type) ? WEAR_COLORS.crown : (type && CHIP_OF[type]) ? accent : own], puff: type && HOT.has(type) ? 'sparks' : 'steam' };
}
