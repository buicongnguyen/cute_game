import type { PlanetId } from './model.ts';

/**
 * Piloted flight between planets. The ship flies over a flat star map; planets sit
 * below that plane, asteroid belts bounce the ship, stardust refuels it, and
 * flying close to a planet discovers it and offers a landing.
 */
export interface StarPlanet { id: PlanetId; x: number; z: number; r: number; ring?: string }
export const STAR_MAP: Record<PlanetId, StarPlanet> = {
  home: { id: 'home', x: 0, z: 0, r: 22 },
  candy: { id: 'candy', x: 250, z: -150, r: 19, ring: '#ffe0f2' },
  ice: { id: 'ice', x: -290, z: -230, r: 21 },
  lava: { id: 'lava', x: 150, z: 360, r: 17, ring: '#ffb070' },
  toy: { id: 'toy', x: -45, z: 150, r: 15, ring: '#ffe14d' }, // the first planet a straight flight from home spots, and the easiest (Lv 4)
  jungle: { id: 'jungle', x: -440, z: 90, r: 20 },
  ocean: { id: 'ocean', x: 440, z: 120, r: 23, ring: '#bff0ff' },
  cloud: { id: 'cloud', x: -80, z: -500, r: 18, ring: '#ffffff' },
  shadow: { id: 'shadow', x: 400, z: -470, r: 19, ring: '#8a5aff' },
};
/** Past this distance from home the ship is pulled back. */
export const SPACE_EDGE = 680;
export const FUEL_MAX = 100;
export const DUST_FUEL = 14;
/** How close the ship must fly to a planet to spot it, beyond its radius. */
export const DISCOVER_RANGE = 45;

export type AsteroidKind = 'rock' | 'ice' | 'lava';
export interface Asteroid { x: number; z: number; r: number; scale: number; spin: number; kind: AsteroidKind }
export interface Stardust { id: number; x: number; z: number }
export interface SpaceLayout { asteroids: Asteroid[]; dust: Stardust[] }

export function seeded(seed: number) { return () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; }; }
const planets = () => Object.values(STAR_MAP);
const clearOfPlanets = (x: number, z: number, margin: number) => planets().every(p => Math.hypot(p.x - x, p.z - z) >= p.r + margin);

/** A dust position in the disc that is not inside a planet. */
export function dustSpot(random: () => number): { x: number; z: number } {
  for (let attempt = 0; attempt < 50; attempt++) {
    const a = random() * Math.PI * 2, d = Math.sqrt(random()) * 650, x = Math.cos(a) * d, z = Math.sin(a) * d;
    if (clearOfPlanets(x, z, 8)) return { x, z };
  }
  return { x: 30, z: 30 };
}

/**
 * Asteroids gather in curved belts (most candidates off a belt are rejected) and keep
 * clear of every planet. The layout is seeded, so every flight shows the same sky.
 */
export function spaceLayout(seed = 7331, asteroidCount = 320, dustCount = 70): SpaceLayout {
  const random = seeded(seed), asteroids: Asteroid[] = [], kinds: AsteroidKind[] = ['rock', 'rock', 'lava', 'ice'];
  for (let attempt = 0; asteroids.length < asteroidCount && attempt < 6000; attempt++) {
    const a = random() * Math.PI * 2, d = Math.sqrt(random()) * 660, x = Math.cos(a) * d, z = Math.sin(a) * d;
    if (!clearOfPlanets(x, z, 30)) continue;
    if (Math.abs(Math.sin(d * .018 + a * 2)) < .55 && random() < .8) continue;
    const scale = 1.6 + random() * 2.9;
    asteroids.push({ x, z, scale, r: scale * .75, spin: random() * Math.PI * 2, kind: kinds[Math.floor(random() * kinds.length)] });
  }
  const dust = Array.from({ length: dustCount }, (_, id) => ({ id, ...dustSpot(random) }));
  return { asteroids, dust };
}

export interface SpaceInput {
  /** -1 turns left, 1 turns right (keyboard). */
  turn: number;
  /** 0 to 1. */
  thrust: number;
  brake: boolean;
  boost: boolean;
  /** Heading toward a held pointer, with thrust set by how far away it is. */
  aim?: { x: number; z: number } | null;
}
export const IDLE_INPUT: SpaceInput = { turn: 0, thrust: 0, brake: false, boost: false, aim: null };

/**
 * Star-map routes (the clone's own addition: the reference's star map is a read-only log).
 * Fuel is what the autopilot burns at cruise (thrust 1 drains 1.1/s at ~26 u/s) plus a
 * small reserve for the approach, so a route that fits the tank always arrives.
 */
export const AUTOPILOT_CRUISE = 26;
export const routeDistance = (from: PlanetId, to: PlanetId) => { const a = STAR_MAP[from], b = STAR_MAP[to]; return Math.max(0, Math.hypot(a.x - b.x, a.z - b.z) - a.r - b.r); };
export const routeFuel = (from: PlanetId, to: PlanetId) => from === to ? 0 : Math.ceil(routeDistance(from, to) / AUTOPILOT_CRUISE * 1.1) + 4;
export type RouteLock = 'here' | 'undiscovered' | 'level' | 'fuel' | null;
export interface RouteOption { id: PlanetId; level: number; discovered: boolean; distance: number; fuel: number; lock: RouteLock; recommended: boolean }
/**
 * Every planet, easiest first (by landing level, then distance). Discovery still matters,
 * as in the reference, which hides undiscovered planets as "mystery" cards: the autopilot
 * only knows the way to planets already spotted. The recommended pick is the hardest
 * planet you can land on (not the one you're on, and home only when nothing else is open).
 */
export function planRoutes(o: { from: PlanetId; level: number; discovered: Iterable<PlanetId>; levels: Record<PlanetId, number>; fuel?: number }): RouteOption[] {
  const found = new Set(o.discovered), tank = o.fuel ?? FUEL_MAX;
  const routes = (Object.keys(STAR_MAP) as PlanetId[]).map(id => {
    const level = o.levels[id] ?? 1, discovered = found.has(id), distance = Math.round(routeDistance(o.from, id)), fuel = routeFuel(o.from, id);
    const lock: RouteLock = id === o.from ? 'here' : !discovered ? 'undiscovered' : o.level < level ? 'level' : fuel > tank ? 'fuel' : null;
    return { id, level, discovered, distance, fuel, lock, recommended: false };
  }).sort((a, b) => a.level - b.level || a.distance - b.distance);
  const open = routes.filter(r => !r.lock), best = open.filter(r => r.id !== 'home').at(-1) ?? open.at(-1);
  if (best) best.recommended = true;
  return routes;
}

export type SpaceEvent =
  | { kind: 'boost' }
  | { kind: 'bump'; strength: number }
  | { kind: 'empty' }
  | { kind: 'edge' }
  | { kind: 'dust'; id: number; fuel: number }
  | { kind: 'discover'; planet: PlanetId }
  | { kind: 'landed'; planet: PlanetId };

export class SpaceFlight {
  x: number; z: number; vx = 0; vz: number; yaw = 0; fuel = FUEL_MAX; time = 0;
  /** The planet under the ship, which can be landed on. */
  over: StarPlanet | null = null;
  landing: { planet: StarPlanet; t: number; done: boolean } | null = null;
  thrusting = false; boosting = false;
  private emptyWarned = false; private edgeAt = -99; private wasBoost = false;
  readonly layout: SpaceLayout; readonly discovered: Set<PlanetId>; private random: () => number;

  constructor(from: PlanetId, discovered: Iterable<PlanetId>, layout = spaceLayout(), random: () => number = Math.random) {
    const start = STAR_MAP[from];
    this.x = start.x; this.z = start.z + start.r + 8; this.vz = 14;
    this.layout = layout; this.discovered = new Set(discovered); this.random = random;
  }
  get speed() { return Math.hypot(this.vx, this.vz); }
  /** The ship's scale while it spirals down to land. */
  get landingScale() { return this.landing ? Math.max(.15, 1 - this.landing.t * .45) : 1; }

  /** A star-map destination: the ship steers itself there and lands (its level was checked when chosen). */
  autopilot: StarPlanet | null = null;
  setAutopilot(id: PlanetId | null) { this.autopilot = id ? STAR_MAP[id] : null; }
  /** Skips the rest of an autopilot flight: the ship arrives over the target and starts landing. */
  skipAutopilot() {
    const p = this.autopilot; if (!p || this.landing) return false;
    const a = Math.atan2(this.x - p.x, this.z - p.z), d = Math.max(0, Math.hypot(this.x - p.x, this.z - p.z) - p.r);
    this.fuel = Math.max(0, this.fuel - d / AUTOPILOT_CRUISE * 1.1);
    this.x = p.x + Math.sin(a) * p.r; this.z = p.z + Math.cos(a) * p.r; this.over = p;
    this.landing = { planet: p, t: 0, done: false }; this.autopilot = null; return true;
  }

  /** Begins the landing spiral when over a planet whose level is met. */
  land(levelMet: (id: PlanetId) => boolean) {
    if (!this.over || this.landing || !levelMet(this.over.id)) return false;
    this.landing = { planet: this.over, t: 0, done: false };
    return true;
  }

  step(dt: number, input: SpaceInput = IDLE_INPUT): SpaceEvent[] {
    const events: SpaceEvent[] = [];
    this.time += dt;
    if (this.landing) {
      const l = this.landing, k = Math.min(1, dt * 2);
      l.t += dt; this.x += (l.planet.x - this.x) * k; this.z += (l.planet.z - this.z) * k; this.yaw += dt * 5;
      this.vx = this.vz = 0; this.thrusting = true; this.boosting = false;
      if (l.t > 1.6 && !l.done) { l.done = true; events.push({ kind: 'landed', planet: l.planet.id }); }
      this.over = l.planet;
      return events;
    }
    const auto = this.autopilot;
    if (auto) input = { turn: 0, thrust: 1, brake: false, boost: false, aim: { x: auto.x, z: auto.z } };
    const boost = input.boost && this.fuel > 0;
    let thrust = Math.max(0, Math.min(1, input.thrust));
    this.yaw -= input.turn * dt * 2.8;
    if (input.aim) {
      const dx = input.aim.x - this.x, dz = input.aim.z - this.z, target = Math.atan2(dx, dz);
      const diff = Math.atan2(Math.sin(target - this.yaw), Math.cos(target - this.yaw));
      this.yaw += diff * Math.min(1, dt * 4);
      thrust = Math.max(thrust, Math.min(1, Math.hypot(dx, dz) / 8));
    }
    if (boost) thrust = Math.max(thrust, 1);
    const accel = (boost ? 55 : 24) * (this.fuel > 0 ? 1 : .35);
    this.vx += Math.sin(this.yaw) * thrust * accel * dt; this.vz += Math.cos(this.yaw) * thrust * accel * dt;
    if (input.brake) { this.vx *= 1 - dt * 2.5; this.vz *= 1 - dt * 2.5; }
    // Drift settles quickly above a planet so landing is easy.
    const drag = 1 - dt * (this.over && thrust < .05 ? 2.2 : .55); this.vx *= drag; this.vz *= drag;
    const cap = boost ? 48 : 26, speed = this.speed;
    if (speed > cap) { const next = speed + (cap - speed) * Math.min(1, dt * 3); this.vx *= next / speed; this.vz *= next / speed; }
    this.fuel = Math.max(0, this.fuel - thrust * dt * (boost ? 5 : 1.1));
    if (this.fuel === 0 && !this.emptyWarned) { this.emptyWarned = true; events.push({ kind: 'empty' }); }
    if (boost && !this.wasBoost) events.push({ kind: 'boost' });
    this.wasBoost = boost; this.boosting = boost; this.thrusting = thrust > .05;
    this.x += this.vx * dt; this.z += this.vz * dt;

    // Asteroids push the ship out and bounce it; a hard knock shakes the camera.
    // The autopilot cruises above the belts, so a chosen route can't get stuck on a rock.
    if (!auto) for (const rock of this.layout.asteroids) {
      const dx = this.x - rock.x, dz = this.z - rock.z, d = Math.hypot(dx, dz), min = rock.r + 1.4;
      if (d >= min || d < .01) continue;
      const nx = dx / d, nz = dz / d; this.x = rock.x + nx * min; this.z = rock.z + nz * min;
      const into = this.vx * nx + this.vz * nz;
      if (into < 0) { this.vx -= nx * into * 1.6; this.vz -= nz * into * 1.6; if (-into > 6) events.push({ kind: 'bump', strength: -into }); }
    }
    const fromHome = Math.hypot(this.x, this.z);
    if (fromHome > SPACE_EDGE) {
      const pull = (fromHome - SPACE_EDGE) * dt * 4; this.vx -= this.x / fromHome * pull; this.vz -= this.z / fromHome * pull;
      if (this.time - this.edgeAt > 6) { this.edgeAt = this.time; events.push({ kind: 'edge' }); }
    }
    for (const dust of this.layout.dust) {
      if (Math.hypot(dust.x - this.x, dust.z - this.z) >= 3) continue;
      this.fuel = Math.min(FUEL_MAX, this.fuel + DUST_FUEL); this.emptyWarned = false;
      events.push({ kind: 'dust', id: dust.id, fuel: this.fuel });
      Object.assign(dust, dustSpot(this.random));
    }
    this.over = null;
    for (const planet of planets()) {
      const d = Math.hypot(planet.x - this.x, planet.z - this.z);
      if (d < planet.r + DISCOVER_RANGE && !this.discovered.has(planet.id)) { this.discovered.add(planet.id); events.push({ kind: 'discover', planet: planet.id }); }
      if (d < planet.r * 1.3) this.over = planet;
    }
    if (auto && this.over === auto) { this.landing = { planet: auto, t: 0, done: false }; this.autopilot = null; }
    return events;
  }
}
