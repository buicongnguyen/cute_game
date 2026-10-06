/**
 * The safe zone round the cottage (18 m at home, 11 m on the other worlds): creatures never enter it, and nothing that happens
 * outside it pays the explorer inside it.
 */
export const safeRadius = (planet: string) => planet === 'home' ? 18 : 11;
export const inSafeZone = (p: { x: number; z: number }, planet: string) => Math.hypot(p.x, p.z) < safeRadius(planet);
/** How far from the explorer a creature may fall and still pay out when the explorer stands in the safe zone: the longest
 * reach in the kit (the snowball, 21 m) plus a big creature's radius, so anything you can hit from the fence still pays. */
export const SAFE_ZONE_REWARD_REACH = 24;
/**
 * Does a creature's fall pay the explorer (XP orbs, loot)? Alone in the world: not when the explorer stands in the safe zone
 * and the creature fell out of reach, whoever or whatever killed it (a neighbour, another creature, a hazard). Online, shared
 * kills are the server's rule, so this never blocks them.
 */
export function defeatPaysPlayer(player: { x: number; z: number }, fell: { x: number; z: number }, planet: string, online: boolean) {
  if (online || !inSafeZone(player, planet)) return true;
  return Math.hypot(fell.x - player.x, fell.z - player.z) <= SAFE_ZONE_REWARD_REACH;
}
