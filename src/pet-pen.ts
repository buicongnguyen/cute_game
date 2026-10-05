import { atHome } from './home-care.ts';

/**
 * Where your equipped pet companion is (no three.js here, so tests and the server can share it). The guard dog's idea
 * (guard-dog.ts), for every pet:
 *
 * At home (the safe village circle, or indoors in the cottage) the pet waits by the animal pen instead of trailing the
 * explorer round the village: the parrot and the dragon perch on the pen's fence posts, the coop roof and the hay bale
 * and now and then flutter to another perch; the firefly and the titan flyers hover over those spots; walkers (bunny,
 * sheep, turtle, robot, titan pets) potter between a few spots at the pen's front corner with small hops. Out in the
 * wilds, or on another planet, it flies or trots out to the explorer and follows a step behind on the right (the dog
 * keeps the left); back inside the safe circle it goes home to the pen. While visiting a friend's garden it stays at
 * your own pen, so it is not drawn there (like the dog).
 *
 * Fighting: a pet shoots only while it follows you away from home (petMayFight); waiting at the pen it never fights.
 * Online the server applies the same rule from your pose (combat-authority.mjs pet: atHome), and other explorers draw
 * your pet beside you only when your pose is outside the safe village (world.ts animateRemotes, petFollows), so
 * everyone sees it in the same place.
 */
export type PetPlace = 'pen' | 'follow' | 'return';
/** perch: lands on things; hover: floats over them; walk: stays on the ground. */
export type PetStyle = 'perch' | 'hover' | 'walk';
/** Pets drawn flying (world.ts petFor keeps the same list). */
export const FLYING_PETS: readonly string[] = ['pet_parrot', 'pet_firefly', 'pet_dragon', 'pet_t_crystal', 'pet_t_whale', 'pet_t_eye', 'pet_b_frostowl', 'pet_b_phoenix', 'pet_b_dragon', 'pet_b_shadowlord'];
const PERCHERS = ['pet_parrot', 'pet_dragon'];
/** How high the feet are above a percher's model origin (metres, from the pet kit's models): it stands on the perch. */
export const PERCH_FEET: Record<string, number> = { pet_parrot: .3, pet_dragon: .19 };
export const petStyle = (id: string | undefined): PetStyle => !id ? 'walk' : PERCHERS.includes(id) ? 'perch' : FLYING_PETS.includes(id) ? 'hover' : 'walk';
/** Where the pet trails the explorer (metres behind and to the right), as the companion always has. */
export const PET_BEHIND = 1.1, PET_SIDE = .9;
/** Top catch-up speeds (m/s): flyers swoop, walkers run; beyond PET_FAR metres it is placed beside the explorer. */
export const PET_FLY = 14, PET_RUN = 11, PET_FAR = 40;
/** Following height of a flyer above the explorer's feet (and its bob), as before. */
export const PET_HOVER = 1.1;

export interface Spot { x: number; y: number; z: number }
/** Pen-local perches (+z toward the gate and the garden): fence post tops, the coop roof, the hay bale (farm-view.ts). */
const PERCHES: readonly Spot[] = [{ x: 1, y: .9, z: -3.25 }, { x: 3, y: .9, z: -3.25 }, { x: -2.05, y: 1.5, z: -1.05 }, { x: 2.45, y: .51, z: .65 }, { x: -1, y: .9, z: -3.25 }];
/** Pen-local ground spots at the yard's front right, clear of the coop, troughs and hay bale. */
const GROUND: readonly Spot[] = [{ x: 3.2, y: 0, z: 1.6 }, { x: 1.6, y: 0, z: 2.1 }, { x: 3.6, y: 0, z: -.2 }, { x: .4, y: 0, z: 2.5 }];
/**
 * The spots the pet uses at the pen (world metres; y = the surface it stands on, or hovers over). Without the pen built
 * (only a marked plot) perchers wait on the ground. Spots within `clear` metres of a species shelter are dropped.
 */
export function penSpots(style: PetStyle, pen: { x: number; z: number }, built = true, shelters: readonly { x: number; z: number }[] = []): Spot[] {
  const local = style === 'walk' || !built ? GROUND : PERCHES;
  const all = local.map(s => ({ x: pen.x + s.x, y: s.y, z: pen.z + s.z }));
  const free = all.filter(s => !shelters.some(h => Math.hypot(h.x - s.x, h.z - s.z) < .9));
  return free.length ? free : all;
}
export const petFollows = (planet: string, pose: { x: number; z: number; y?: number }, indoors = false) => !atHome(planet, pose, indoors);
/** True when the pet may fight: only while it follows you away from home (never from the pen). */
export const petMayFight = (place: PetPlace, planet: string, pose: { x: number; z: number; y?: number }, indoors = false) => place === 'follow' && petFollows(planet, pose, indoors);
/** The trailing spot for a facing (radians, +z forward at 0). */
export function petTrail(player: { x: number; z: number }, facing: number) {
  const s = Math.sin(facing), c = Math.cos(facing);
  return { x: player.x - s * PET_BEHIND + c * PET_SIDE, z: player.z - c * PET_BEHIND - s * PET_SIDE };
}

export interface PetLink {
  place: PetPlace; x: number; y: number; z: number; heading: number; speed: number;
  /** The spot it waits at (index into the pen spots), seconds until the next move, the move under way. */
  spot: number; wait: number; hop: { from: Spot; to: Spot; t: number; dur: number } | null;
  /** Moves made so far (seeds which spot comes next: the same every run, never Math.random). */
  seq: number;
  /** True while it sits on a perch or the ground (wings folded, no hop). */
  resting: boolean;
}
export const newPetLink = (): PetLink => ({ place: 'pen', x: 0, y: 0, z: 0, heading: 0, speed: 0, spot: 0, wait: 2, hop: null, seq: 0, resting: true });
const frac = (n: number) => { const v = Math.sin(n * 127.1 + 311.7) * 43758.5453; return v - Math.floor(v); };
const turnTo = (from: number, to: number, max: number) => from + Math.max(-max, Math.min(max, Math.atan2(Math.sin(to - from), Math.cos(to - from))));
/** The resting height of the model origin at a spot: perchers stand on it, hover pets float over it, walkers stand. */
export function restY(style: PetStyle, spot: Spot, feet = 0) { return style === 'perch' ? spot.y - feet : style === 'hover' ? Math.max(.9, spot.y + .65) : spot.y; }

/**
 * One step. `follow` says where the pet belongs now (petFollows, false while visiting); `spots` are the pen spots
 * ([] when this world has no pen: another planet); `groundY` is the explorer's feet. Returns the new place.
 */
export function stepPet(p: PetLink, dt: number, follow: boolean, player: { x: number; z: number }, facing: number, groundY: number, spots: readonly Spot[], style: PetStyle, feet = 0): PetPlace {
  if (!(dt > 0)) return p.place;
  const flyer = style !== 'walk';
  if (follow && p.place === 'pen' && !spots.length) { const at = petTrail(player, facing + Math.PI * .6); p.x = at.x; p.z = at.z; p.y = groundY + (flyer ? PET_HOVER : 0); p.speed = 0; }
  if (follow && p.place !== 'follow') { p.place = 'follow'; p.hop = null; }
  else if (!follow && p.place === 'follow') {
    if (spots.length) { p.place = 'return'; p.spot = nearest(spots, p); } else p.place = 'pen';
  }
  p.resting = false;
  if (p.place === 'follow') {
    const goal = petTrail(player, facing), dx = goal.x - p.x, dz = goal.z - p.z, dist = Math.hypot(dx, dz);
    if (dist > PET_FAR) { p.x = goal.x; p.z = goal.z; p.speed = 0; }
    else {
      // The companion's old follow (an ease of 4/s) when close; capped at a swoop or a run when far, so it never jumps.
      const step = Math.min(dist * (1 - Math.exp(-dt * 4)), (flyer ? PET_FLY : PET_RUN) * dt);
      if (step > 1e-5) { p.x += dx / dist * step; p.z += dz / dist * step; p.heading = turnTo(p.heading, Math.atan2(dx, dz), 12 * dt); }
      p.speed = step / dt;
    }
    p.y += (groundY + (flyer ? PET_HOVER : 0) - p.y) * (1 - Math.exp(-dt * 6));
    return p.place;
  }
  if (!spots.length) { p.place = 'pen'; return p.place; }
  p.spot = Math.max(0, Math.min(spots.length - 1, p.spot | 0));
  if (p.place === 'return') {
    const goal = spots[p.spot], gy = restY(style, goal, feet), dx = goal.x - p.x, dz = goal.z - p.z, dist = Math.hypot(dx, dz);
    // Sent home from far away (a respawn, a landing): it is simply back at the pen.
    if (dist > PET_FAR * 1.6 || dist < .12) { p.x = goal.x; p.z = goal.z; p.y = gy; p.place = 'pen'; p.speed = 0; p.wait = 3 + 4 * frac(p.seq); return p.place; }
    const want = Math.min(flyer ? PET_FLY * .7 : PET_RUN * .6, Math.max(1.4, dist * 2.2));
    p.speed += (want - p.speed) * (1 - Math.exp(-dt * 5));
    const step = Math.min(dist, p.speed * dt); p.x += dx / dist * step; p.z += dz / dist * step;
    p.heading = turnTo(p.heading, Math.atan2(dx, dz), 10 * dt);
    // Flyers come in high and drop onto the perch over the last two metres.
    const cruise = flyer ? Math.max(gy, groundY + 1.6) : gy, y = dist < 2 ? gy + (cruise - gy) * dist / 2 : cruise;
    p.y += (y - p.y) * (1 - Math.exp(-dt * 6));
    return p.place;
  }
  // At the pen: rest, then hop or flutter to another spot.
  if (p.hop) {
    const h = p.hop; h.t = Math.min(1, h.t + dt / h.dur); const k = h.t * h.t * (3 - 2 * h.t);
    const fy = restY(style, h.from, feet), ty = restY(style, h.to, feet), arc = Math.sin(h.t * Math.PI) * (style === 'walk' ? .12 : .9);
    const nx = h.from.x + (h.to.x - h.from.x) * k, nz = h.from.z + (h.to.z - h.from.z) * k;
    p.speed = Math.hypot(nx - p.x, nz - p.z) / dt; p.x = nx; p.z = nz; p.y = fy + (ty - fy) * k + arc;
    p.heading = turnTo(p.heading, Math.atan2(h.to.x - h.from.x, h.to.z - h.from.z), 8 * dt);
    if (h.t >= 1) { p.hop = null; p.wait = (style === 'walk' ? 3 : 5) + 6 * frac(p.seq + .5); }
    return p.place;
  }
  const at = spots[p.spot]; p.x = at.x; p.z = at.z; p.y += (restY(style, at, feet) - p.y) * (1 - Math.exp(-dt * 8)); p.speed = 0; p.resting = true;
  if ((p.wait -= dt) <= 0 && spots.length > 1) {
    p.seq++; let next = Math.floor(frac(p.seq) * (spots.length - 1)); if (next >= p.spot) next++;
    const to = spots[next], d = Math.hypot(to.x - at.x, to.z - at.z);
    p.hop = { from: at, to, t: 0, dur: Math.max(.7, Math.min(2.6, d / (style === 'walk' ? 1.6 : 3.2))) }; p.spot = next; p.resting = false;
  }
  return p.place;
}
function nearest(spots: readonly Spot[], p: { x: number; z: number }) {
  let best = 0, d = Infinity; spots.forEach((s, i) => { const e = Math.hypot(s.x - p.x, s.z - p.z); if (e < d) { d = e; best = i; } }); return best;
}
