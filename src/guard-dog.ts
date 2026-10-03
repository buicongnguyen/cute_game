import { atHome } from './home-care.ts';

/**
 * Where the garden guard dog is (no three.js here, so tests and the server can share it).
 *
 * At home (the safe village circle, or indoors in the cottage) the dog keeps to the pen on a loose leash
 * (farm-roam.ts `leash`): it sniffs, sits, wags and now and then trots a short loop, and it does not trail the
 * explorer round the village. Out in the wilds, or on another planet, it trots to the explorer and follows a step
 * behind on the side away from any pet; it lands with the explorer on a new planet. Back inside the safe circle (or
 * landing home) it trots back to the pen, and the pen takes it over again where it arrives.
 *
 * Guarding: the dog's garden protection is a property of owning it (farm.ts hasGuardDog / guardBiteDamage), and is
 * unchanged by where it walks: its job is the garden, visitors always find it at the pen (a visit shows the host's
 * pen), and the server never has to track a dog. Fights: following is cosmetic only (no damage, no aggro), so the
 * pet slot stays the one companion that fights and nothing new needs server validation.
 */
export type DogPlace = 'pen' | 'follow' | 'return';
/** The leash round the pen spot (metres): the dog's strolls and loops keep inside it. */
export const DOG_LEASH = 3.2;
/** Where the dog trails the explorer: metres behind and to the left (pets trail on the right). */
export const DOG_BEHIND = 1.25, DOG_SIDE = -.95;
/** Top catch-up speed (m/s, above a hasted explorer's); beyond FAR metres it is placed beside the explorer (after a ride, a fall). */
export const DOG_RUN = 11, DOG_FAR = 26;
/** The spot by the pen the leash is tied to: in front of the dog house when one is built, else the pen's front. */
export function leashSpot(pen: { x: number; z: number }, house?: { x: number; z: number } | null) {
  return house && Number.isFinite(house.x) && Number.isFinite(house.z) ? { x: house.x, z: house.z + .9 } : { x: pen.x, z: pen.z + 1.2 };
}
/** True while the dog should be with the explorer: away from the safe village (or on another planet). */
export function dogFollows(planet: string, pose: { x: number; z: number; y?: number }, indoors = false) {
  return !atHome(planet, pose, indoors);
}
export interface DogLink { place: DogPlace; x: number; z: number; heading: number; speed: number }
export const newDogLink = (): DogLink => ({ place: 'pen', x: 0, z: 0, heading: 0, speed: 0 });
/** The trailing spot behind the explorer for a facing (radians, +z forward at 0). */
export function trailSpot(player: { x: number; z: number }, facing: number) {
  const s = Math.sin(facing), c = Math.cos(facing);
  return { x: player.x - s * DOG_BEHIND + c * DOG_SIDE, z: player.z - c * DOG_BEHIND - s * DOG_SIDE };
}
/**
 * One step of the link. `follow` says where the dog belongs now; `from` is where the pen has it (to pick it up from the
 * pen) or null when there is no pen in this world (another planet: it appears beside the explorer); `leash` is the pen
 * spot to trot back to (null off the home planet). Returns the new place; when it turns 'pen' the pen takes the dog
 * over at (x, z).
 */
export function stepDog(d: DogLink, dt: number, follow: boolean, player: { x: number; z: number }, facing: number, from: { x: number; z: number } | null, leash: { x: number; z: number } | null) {
  if (follow && d.place === 'pen') {
    const at = from ?? trailSpot(player, facing + Math.PI * .6);
    d.x = at.x; d.z = at.z; d.place = 'follow'; d.speed = 0;
  } else if (!follow && d.place === 'follow') d.place = leash ? 'return' : 'pen';
  else if (follow && d.place === 'return') d.place = 'follow';
  if (d.place === 'pen') { d.speed = 0; return d.place; }
  const goal = d.place === 'follow' ? trailSpot(player, facing) : leash!;
  const dx = goal.x - d.x, dz = goal.z - d.z, dist = Math.hypot(dx, dz);
  if (d.place === 'follow' && dist > DOG_FAR) { const at = trailSpot(player, facing); d.x = at.x; d.z = at.z; d.speed = 0; return d.place; }
  if (d.place === 'return' && dist < .6) { d.place = 'pen'; d.speed = 0; return d.place; }
  // Speed grows with the gap (a stroll close by, a trot, a run to catch up); a small dead zone lets it sit beside you.
  const want = dist < .35 ? 0 : Math.min(DOG_RUN, Math.max(1.2, dist * 2.6));
  d.speed += (want - d.speed) * (1 - Math.exp(-dt * 6));
  const step = Math.min(dist, d.speed * dt);
  if (step > 1e-4) {
    d.x += dx / dist * step; d.z += dz / dist * step;
    const turn = Math.atan2(Math.sin(Math.atan2(dx, dz) - d.heading), Math.cos(Math.atan2(dx, dz) - d.heading));
    d.heading += Math.max(-10 * dt, Math.min(10 * dt, turn));
  } else if (d.place === 'follow') {
    // Sitting beside the explorer, it turns the way the explorer looks.
    const turn = Math.atan2(Math.sin(facing - d.heading), Math.cos(facing - d.heading)); d.heading += Math.max(-3 * dt, Math.min(3 * dt, turn));
  }
  return d.place;
}
