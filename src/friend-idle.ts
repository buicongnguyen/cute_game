/**
 * What a helper does when there is no job: instead of standing at its post for ever, now and then it walks home for a rest
 * (and comes out again later) or strolls round the farm, stopping to look at a few beds or animals, and then goes back to
 * its post. Pure helpers here; friend-crew.ts walks the route.
 */
export interface Spot { x: number; z: number }
export interface Stop { x: number; z: number; /** What it looks at while it stops. */ at: Spot }
/** Seconds without a job before it does something (4 to 8): a helper never stands still for long. */
export const idleAfter = (rand: () => number) => 4 + rand() * 4;
/** How long it stops to look at something (2 to 4 seconds). */
export const lookFor = (rand: () => number) => 2 + rand() * 2;
/** Mostly a stroll round the farm; about one idle time in seven it goes home for a short rest instead. */
export const idleChoice = (rand: () => number): 'home' | 'stroll' => rand() < .15 ? 'home' : 'stroll';
/** Up to three different things to look at, in the order that keeps the walk short (each next one is the nearest left). */
export function strollRoute(spots: readonly Spot[], from: Spot, rand: () => number, count = 3, standOff = .9): Stop[] {
  const pool = spots.filter(s => Number.isFinite(s.x) && Number.isFinite(s.z)), picked: Spot[] = [];
  while (picked.length < count && pool.length) picked.push(pool.splice(Math.floor(rand() * pool.length), 1)[0]);
  const route: Stop[] = []; let here = from;
  while (picked.length) {
    let best = 0; for (let i = 1; i < picked.length; i++) if (Math.hypot(picked[i].x - here.x, picked[i].z - here.z) < Math.hypot(picked[best].x - here.x, picked[best].z - here.z)) best = i;
    const at = picked.splice(best, 1)[0], dx = here.x - at.x, dz = here.z - at.z, d = Math.hypot(dx, dz) || 1;
    const stop = { x: at.x + dx / d * standOff, z: at.z + dz / d * standOff, at }; route.push(stop); here = stop;
  }
  return route;
}
