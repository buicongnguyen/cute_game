/**
 * How the farm animals roam the home village (no three.js here, so tests can run it for minutes of game time).
 * Each animal walks a straight segment checked clear once when it picks a goal (sampled spots plus a sampled
 * segment test against the world's obstacles and keep-out circles), then rests there a while: cows graze head
 * down, chewing and shuffling a step now and then; hens peck, sit or take a dust bath. Young ones keep near an
 * adult; after a long trip an animal drifts back to its yard. Nothing here runs a path search, and the only
 * per-frame world query is one point test per moving animal (so a bed placed in its way stops it).
 * Coordinates are world metres.
 */
export type RoamKind = 'chicken' | 'cow';
export type Rest = 'none' | 'graze' | 'peck' | 'sit' | 'dust' | 'look';
export interface RoamArea {
  /** True when a body of radius r centred here would touch something it must keep off (or leave the village). */
  blocked(x: number, z: number, r: number): boolean;
  /** The yard the animals come back to. */
  home: { x: number; z: number; rx: number; rz: number };
  /** Open ground for wandering: a disc around the village centre. */
  radius: number;
  /** A short grid route for a long trip (searched once per trip, never per frame); empty when there is none. */
  route?(ax: number, az: number, bx: number, bz: number, r: number): { x: number; z: number }[];
}
export interface Roamer {
  uid: number; kind: RoamKind; young: boolean; x: number; z: number; heading: number; goalX: number; goalZ: number;
  speed: number; walking: boolean; rest: Rest; restT: number;
  /** Head pose 0..1: a peck pulse, or held down while grazing. */
  peck: number; peckT: number; graze: number; sit: number; flap: number; flee: number;
  /** Seconds away from the yard since the last visit; seconds left of a cow's slow shuffle while grazing. */
  trip: number; tripLimit: number; shuffle: number; shuffleT: number;
  /** Seconds to the next look at whether the resting spot is still free (a bed may have been placed on it). */
  checkT: number;
  /** A far spot it is walking to in legs, and whether that is the trip home. */
  dest: { x: number; z: number } | null; homeward: boolean;
  /** The trip's remaining waypoints (straightened), when the area can route. */
  path: { x: number; z: number }[];
  /** Seconds left for the walk under way: a walk that cannot finish (circling its goal, pushed by a neighbour) gives up. */
  walkT: number;
}
/** Body radius kept off obstacles. */
export const roamRadius = (w: { kind: RoamKind; young: boolean }) => w.kind === 'cow' ? (w.young ? .5 : .75) : (w.young ? .2 : .28);
const TAU = Math.PI * 2;

export function inHomeYard(area: RoamArea, x: number, z: number, pad = 0) { const h = area.home; return ((x - h.x) / (h.rx + pad)) ** 2 + ((z - h.z) / (h.rz + pad)) ** 2 < 1; }
/** A straight walk is clear when sampled points every 0.3 m along it are (cheap: only checked when a goal is picked). */
export function segmentClear(area: RoamArea, ax: number, az: number, bx: number, bz: number, r: number) {
  const d = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.ceil(d / .3));
  for (let i = 1; i <= n; i++) if (area.blocked(ax + (bx - ax) * i / n, az + (bz - az) * i / n, r)) return false;
  return true;
}
/** A spot near (x, z) within d0..d1 metres that the animal can walk to straight; null when none was found in a few tries. */
export function spotNear(area: RoamArea, rng: () => number, w: Roamer, x: number, z: number, d0: number, d1: number, tries = 10) {
  const r = roamRadius(w);
  for (let i = 0; i < tries; i++) {
    const a = rng() * TAU, d = d0 + rng() * (d1 - d0), gx = x + Math.sin(a) * d, gz = z + Math.cos(a) * d;
    // Grown cows look for grass: the yard's sand only when nothing else turns up.
    if (Math.hypot(gx, gz) > area.radius - r || (w.kind === 'cow' && !w.young && i < 7 && inHomeYard(area, gx, gz, .3)) || !segmentClear(area, w.x, w.z, gx, gz, r)) continue;
    return { x: gx, z: gz };
  }
  return null;
}
/** A free starting spot in the yard (or near it). */
export function spawnSpot(area: RoamArea, rng: () => number, kind: RoamKind, young: boolean) {
  const h = area.home, r = roamRadius({ kind, young });
  for (let i = 0; i < 40; i++) {
    const a = rng() * TAU, d = Math.sqrt(rng()) * (1 + i / 20), x = h.x + Math.sin(a) * h.rx * d, z = h.z + Math.cos(a) * h.rz * d;
    if (Math.hypot(x, z) < area.radius - r && !area.blocked(x, z, r)) return { x, z };
  }
  return { x: h.x, z: h.z + h.rz * .5 };
}
export function newRoamer(uid: number, kind: RoamKind, young: boolean, at: { x: number; z: number }, rng: () => number): Roamer {
  return { uid, kind, young, x: at.x, z: at.z, heading: rng() * TAU, goalX: at.x, goalZ: at.z, speed: 0, walking: false, rest: kind === 'cow' ? 'graze' : 'peck', restT: 1 + rng() * 4,
    peck: 0, peckT: 1 + rng() * 3, graze: 0, sit: 0, flap: 0, flee: 0, trip: 0, tripLimit: kind === 'cow' ? 200 + rng() * 200 : 90 + rng() * 90, shuffle: 0, shuffleT: 2 + rng() * 4, checkT: rng(), dest: null, homeward: false, path: [], walkT: 0 };
}

/** Starts a rest where the animal stands: what it does and for how long (long rests make the field feel calm). */
function startRest(w: Roamer, rng: () => number, area?: RoamArea) {
  w.walking = false; const k = rng();
  // Back in the sandy yard a cow stands and chews rather than grazing on sand.
  if (w.kind === 'cow' && area && inHomeYard(area, w.x, w.z)) { w.rest = 'look'; w.restT = 4 + rng() * 6; }
  else if (w.kind === 'cow') { w.rest = k < .85 ? 'graze' : 'look'; w.restT = w.rest === 'graze' ? (w.young ? 5 : 9) + rng() * (w.young ? 8 : 15) : 3 + rng() * 4; }
  else if (w.young) { w.rest = k < .75 ? 'peck' : 'sit'; w.restT = w.rest === 'sit' ? 5 + rng() * 8 : 1.5 + rng() * 3.5; }
  else { w.rest = k < .62 ? 'peck' : k < .8 ? 'sit' : k < .92 ? 'dust' : 'look'; w.restT = w.rest === 'peck' ? 2.5 + rng() * 5 : w.rest === 'look' ? 1.5 + rng() * 2 : 8 + rng() * 14; }
}
/** One leg of up to 6 m toward a far target, bending up to ~80 degrees round whatever stands in the straight line. */
function legToward(w: Roamer, area: RoamArea, tx: number, tz: number) {
  const r = roamRadius(w), dx = tx - w.x, dz = tz - w.z, step = Math.min(Math.hypot(dx, dz), 6), base = Math.atan2(dx, dz);
  for (let i = 0; i < 7; i++) {
    const a = base + (i ? (i % 2 ? 1 : -1) * Math.ceil(i / 2) * .45 : 0);
    for (const k of [1, .5]) { const gx = w.x + Math.sin(a) * step * k, gz = w.z + Math.cos(a) * step * k; if (Math.hypot(gx, gz) < area.radius - r && segmentClear(area, w.x, w.z, gx, gz, r)) return { x: gx, z: gz }; }
  }
  return null;
}
/** Drops the grid route's in-between points wherever a straight walk skips them, so the trip reads as a few strolls. */
function straighten(area: RoamArea, w: Roamer, route: { x: number; z: number }[]) {
  const out: { x: number; z: number }[] = [], r = roamRadius(w); let from = { x: w.x, z: w.z }, i = 0;
  while (i < route.length) {
    let j = route.length - 1; while (j > i && !segmentClear(area, from.x, from.z, route[j].x, route[j].z, r)) j--;
    out.push(route[j]); from = route[j]; i = j + 1;
  }
  return out;
}
/**
 * Picks the next walk: on with a long trip (a far spot in the village, or home to the yard after a long time away) in
 * legs with rests between, beside an adult for the young, mostly a short stroll.
 */
function pickGoal(w: Roamer, all: readonly Roamer[], area: RoamArea, rng: () => number) {
  const h = area.home, r = roamRadius(w);
  let g: { x: number; z: number } | null = null;
  if (w.trip > w.tripLimit && !inHomeYard(area, w.x, w.z) && !w.homeward) { w.homeward = true; w.dest = { x: h.x, z: h.z }; }
  if (!w.dest && !w.young && rng() < (w.kind === 'cow' ? .35 : .25)) {
    // A far trip: any open spot in the village.
    for (let i = 0; i < 8 && !w.dest; i++) { const a = rng() * TAU, d = Math.sqrt(rng()) * (area.radius - r), x = Math.sin(a) * d, z = Math.cos(a) * d; if (Math.hypot(x - w.x, z - w.z) > 5 && !area.blocked(x, z, r)) w.dest = { x, z }; }
  }
  if (w.dest && !w.path.length && area.route && Math.hypot(w.dest.x - w.x, w.dest.z - w.z) > 3) w.path = straighten(area, w, area.route(w.x, w.z, w.dest.x, w.dest.z, r));
  if (w.dest && w.path.length) { g = w.path.shift()!; if (!w.path.length) { w.dest = null; w.homeward = false; } }
  else if (w.dest) {
    if (Math.hypot(w.dest.x - w.x, w.dest.z - w.z) < 1.2 || (w.homeward && inHomeYard(area, w.x, w.z, -.5))) { w.dest = null; w.homeward = false; }
    else if (!(g = legToward(w, area, w.dest.x, w.dest.z))) { w.dest = null; w.homeward = false; }
  }
  if (!g && w.young) {
    let mom: Roamer | null = null, best = Infinity;
    for (const o of all) if (o.kind === w.kind && !o.young) { const d = Math.hypot(o.x - w.x, o.z - w.z); if (d < best) { best = d; mom = o; } }
    if (mom && best > 1.6) g = best > 6 ? legToward(w, area, mom.x, mom.z) : spotNear(area, rng, w, mom.x, mom.z, .8, 1.8);
  }
  if (!g) g = w.kind === 'cow' ? spotNear(area, rng, w, w.x, w.z, 1.5, 5) : spotNear(area, rng, w, w.x, w.z, .7, 3);
  if (!g) { startRest(w, rng, area); w.restT = Math.min(w.restT, 2); return; }
  w.goalX = g.x; w.goalZ = g.z; w.walking = true; w.rest = 'none'; w.walkT = 4 + Math.hypot(g.x - w.x, g.z - w.z) * (w.kind === 'cow' ? 5 : 3);
}

/** One step of one animal: flee the explorer, rest, or walk its clear segment; keep a little apart from the others. */
export function stepRoamer(w: Roamer, all: readonly Roamer[], area: RoamArea, rng: () => number, dt: number, player: { x: number; z: number } | null) {
  const cow = w.kind === 'cow', r = roamRadius(w);
  w.flee = Math.max(0, w.flee - dt);
  if (player && w.flee <= 0) {
    const dx = w.x - player.x, dz = w.z - player.z, d = Math.hypot(dx, dz), shy = cow ? 1.5 : 1.3;
    if (d < shy) {
      const base = d > 1e-3 ? Math.atan2(dx, dz) : rng() * TAU, run = cow ? 1.6 : 2.2;
      for (const turn of [0, .6, -.6, 1.2, -1.2, 1.8, -1.8]) {
        const gx = w.x + Math.sin(base + turn) * run, gz = w.z + Math.cos(base + turn) * run;
        if (Math.hypot(gx, gz) < area.radius - r && segmentClear(area, w.x, w.z, gx, gz, r)) { w.goalX = gx; w.goalZ = gz; w.walking = true; w.rest = 'none'; w.walkT = 4; w.path = []; w.dest = null; w.homeward = false; w.flee = cow ? 1.2 : .8; w.peck = 0; w.sit = 0; if (!cow) w.flap = 1; break; }
      }
    }
  }
  w.trip = inHomeYard(area, w.x, w.z) ? 0 : w.trip + dt;
  // Head: grazing holds it down with a chew; pecking is a quick dip now and then.
  const grazing = !w.walking && w.rest === 'graze';
  w.graze += ((grazing ? 1 : 0) - w.graze) * Math.min(1, dt * 2.5);
  w.sit += ((!w.walking && (w.rest === 'sit' || w.rest === 'dust') ? 1 : 0) - w.sit) * Math.min(1, dt * 3);
  w.peckT -= dt; if (w.peckT <= 0) { const pecking = !w.walking && w.rest === 'peck'; w.peckT = pecking ? .5 + rng() * 1.2 : 2 + rng() * 4; w.peck = cow ? 0 : 1; }
  w.peck = Math.max(0, w.peck - dt * 1.6);
  w.flap = Math.max(0, w.flap - dt * 2.5); if (!cow && (w.rest === 'dust' && !w.walking ? rng() < dt * .6 : rng() < dt * .04)) w.flap = 1;
  const px = w.x, pz = w.z;
  if (!w.walking) {
    w.restT -= dt;
    // A grazing cow shuffles a step to fresh grass now and then, head still down.
    if (grazing) {
      w.shuffleT -= dt; if (w.shuffleT <= 0) { w.shuffleT = 3 + rng() * 4; w.shuffle = 1.2; w.heading += (rng() - .5) * .8; }
      w.shuffle = Math.max(0, w.shuffle - dt);
    } else w.shuffle = 0;
    const want = w.shuffle > 0 ? .12 : 0;
    w.speed += (want - w.speed) * Math.min(1, dt * 4);
    if (w.speed > .01) { w.x += Math.sin(w.heading) * w.speed * dt; w.z += Math.cos(w.heading) * w.speed * dt; }
    if (w.restT <= 0) pickGoal(w, all, area, rng);
  } else {
    const dx = w.goalX - w.x, dz = w.goalZ - w.z, d = Math.hypot(dx, dz);
    if (d < (cow ? .35 : .15) || (w.walkT -= dt) <= 0) { if (w.path.length && rng() < .75) pickGoal(w, all, area, rng); else startRest(w, rng, area); }
    else {
      const want = Math.atan2(dx, dz), turn = Math.atan2(Math.sin(want - w.heading), Math.cos(want - w.heading)), rate = cow ? 1.6 : 4;
      w.heading += Math.max(-rate * dt, Math.min(rate * dt, turn));
      const top = (cow ? .45 : .8) * (w.young ? 1.15 : 1) * (w.flee > 0 ? (cow ? 1.8 : 2.4) : 1);
      // Turn on the spot first, then slow while still turning: the walk stays on the segment that was checked clear.
      w.speed = Math.min(top, w.speed + dt * 2) * (Math.abs(turn) > 1 ? 0 : Math.abs(turn) > .45 ? .3 : 1);
      w.x += Math.sin(w.heading) * w.speed * dt; w.z += Math.cos(w.heading) * w.speed * dt;
    }
  }
  // A little personal space (cows need more).
  for (const o of all) {
    if (o === w) continue; const dx = w.x - o.x, dz = w.z - o.z, d = Math.hypot(dx, dz), need = cow && o.kind === 'cow' ? 1.8 : cow || o.kind === 'cow' ? .9 : .35;
    if (d > 1e-3 && d < need) { const push = (need - d) * .5; w.x += dx / d * push; w.z += dz / d * push; }
  }
  // The world wins: a move into anything (a bed just placed, an arc off the checked line) is undone and the walk ends;
  // one already standing somewhere blocked may walk out.
  if ((w.x !== px || w.z !== pz) && (Math.hypot(w.x, w.z) > area.radius - r || area.blocked(w.x, w.z, r)) && !area.blocked(px, pz, r)) {
    w.x = px; w.z = pz; w.speed = 0; if (w.walking) { startRest(w, rng, area); w.restT = Math.min(w.restT, .6 + rng()); } else w.shuffle = 0;
  }
}
