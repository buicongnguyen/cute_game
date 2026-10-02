/** Where a friend's cage may stand around its boss (pure: friend-crew.ts places it, the server checks a rescue against it). */
export const CAGE_GAP = 6.5, RESCUE_REACH = 2.4;
/**
 * The spots a cage tries, in order: towards the village from the boss's spawn, then swinging out either side.
 * The client takes the first one clear of trees and rocks; the server, without the scenery, accepts any of them.
 */
export function cageCandidates(bx: number, bz: number) {
  const base = Math.atan2(-bz, -bx), spots: { x: number; z: number }[] = [];
  for (let i = 0; i < 12; i++) { const a = base + (i % 2 ? 1 : -1) * Math.ceil(i / 2) * .35; spots.push({ x: bx + Math.cos(a) * CAGE_GAP, z: bz + Math.sin(a) * CAGE_GAP }); }
  return spots;
}
