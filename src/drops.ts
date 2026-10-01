/**
 * Ground loot, after the reference's 29/09 update (bundle class Ph @853004): kill loot is tossed onto the
 * ground, bobs over a rarity ring, is pulled to the explorer by a short-range magnet and vanishes after 30 s.
 * This module is the pure simulation: plain data, a seeded toss, no three.js and no DOM, so it can be tested.
 * Drops are transient on purpose (the reference never saves them either); see drops-view.ts for the drawing.
 */
export const DROP = {
  gravity: 18, bounce: .35, friction: .6, settle: .8, // toss arc: g 18, bounce ×0.35, sideways ×0.6, stop under 0.8 m/s
  lift: .6, launch: 5, tossMin: .6, tossMax: 1.5, tossSpeed: 2.4, // spawn 0.6 m up, 5 m/s up, lands 0.6-1.5 m away
  thrown: 2.2, thrownSpread: .5, rest: .25, // thrown items fly 2.2 m ahead; resting height above the ground
  bob: .08, bobRate: 3, spin: 1.5, // ±0.08 m at 3 rad/s, 1.5 rad/s spin
  magnetRadius: 3.2, magnetDelay: .6, collect: .6, pullMin: 6, pullMax: 12, // pull at max(6, 12 − 2d) m/s
  life: 30, blink: 5, blinkFast: 2, blinkRate: 16, blinkFastRate: 30, // blink in the last 5 s, faster in the last 2
  labelRange: 14, warnBelow: 10, selfLockRange: 3.6, fullWarnRange: 1.2, fullWarnEvery: 4,
} as const;

export type Rarity = 'common' | 'rare' | 'legendary';
export interface Drop {
  uid: number; item: string; count: number; rarity: Rarity;
  x: number; y: number; z: number; vx: number; vy: number; vz: number;
  /** Ground height under the drop; the card rests DROP.rest above it. */
  ground: number;
  age: number; life: number; phase: number; spin: number;
  /** True once it has stopped bouncing. */
  resting: boolean;
  /** A thrown item cannot be re-collected by its thrower until they walk 3.6 m away. */
  selfLock: boolean;
  /** Online only: the killer's id. TODO(online): owner-first 10 s lock lives behind the network hooks. */
  owner?: string;
}
export interface SpawnOptions { rarity?: Rarity; ground?: number; thrown?: boolean; dir?: number; toss?: boolean; owner?: string }
export interface Hero { x: number; z: number; alive?: boolean }
export interface StepEvents { picked: Drop[]; expired: Drop[]; full: Drop[] }

/** mulberry32: a small seeded generator, so tosses replay exactly in tests. */
export function seeded(seed: number) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

export const remaining = (d: Drop) => d.life - d.age;
/** Visible this frame? Blinks at 16 Hz in the last 5 s and 30 Hz in the last 2 s (bundle @861325). */
export function blinkVisible(left: number, time: number) {
  return left >= DROP.blink || Math.sin(time * (left < DROP.blinkFast ? DROP.blinkFastRate : DROP.blinkRate)) > 0;
}
/** The countdown pill: '⏳ 30s', red ('warn') under 10 s. */
export function dropLabel(d: Drop) { const left = Math.max(0, remaining(d)); return { text: `⏳ ${Math.ceil(left)}s`, warn: left < DROP.warnBelow }; }
export const RING_COLORS: Record<Rarity, string> = { common: '#ffe66d', rare: '#d68cff', legendary: '#ffb13d' };
export const rarityOf = (item?: { rare?: boolean; legend?: boolean }): Rarity => item?.legend ? 'legendary' : item?.rare ? 'rare' : 'common';

export class DropManager {
  drops: Drop[] = [];
  time = 0;
  private next = 1; private fullWarnT = 0;
  readonly random: () => number;
  constructor(seed = 1) { this.random = seeded(seed); }

  /** Toss a stack onto the ground from a point (kills, overflow). */
  spawn(item: string, count: number, at: { x: number; z: number }, o: SpawnOptions = {}): Drop {
    const r = this.random, angle = o.dir == null ? r() * Math.PI * 2 : o.dir + (r() - .5) * DROP.thrownSpread;
    const reach = o.thrown ? DROP.thrown : o.toss === false ? 0 : DROP.tossMin + r() * (DROP.tossMax - DROP.tossMin), ground = o.ground ?? 0;
    const d: Drop = {
      uid: this.next++, item, count, rarity: o.rarity ?? 'common', x: at.x, y: ground + DROP.lift, z: at.z,
      vx: Math.cos(angle) * reach * DROP.tossSpeed, vy: DROP.launch, vz: Math.sin(angle) * reach * DROP.tossSpeed,
      ground, age: 0, life: DROP.life, phase: r() * Math.PI * 2, spin: r() * Math.PI * 2, resting: false, selfLock: !!o.thrown, owner: o.owner,
    };
    this.drops.push(d); return d;
  }

  /**
   * Advance every drop. canAdd says whether the bag has room (the magnet ignores drops that would not fit);
   * groundAt gives terrain height while a drop moves. Picked drops are removed and returned: the caller
   * puts them in the bag. `full` lists drops the explorer stands on without room, at most every 4 s.
   */
  step(dt: number, hero: Hero, canAdd: (item: string, count: number) => boolean, groundAt?: (x: number, z: number) => number, magnet = 1): StepEvents {
    const events: StepEvents = { picked: [], expired: [], full: [] };
    if (!(dt > 0)) return events;
    this.time += dt; this.fullWarnT -= dt;
    const radius = DROP.magnetRadius * magnet, alive = hero.alive !== false;
    for (let i = this.drops.length - 1; i >= 0; i--) {
      const d = this.drops[i]; d.age += dt; d.spin += dt * DROP.spin;
      const moving = !d.resting;
      if (moving) {
        d.vy -= DROP.gravity * dt; d.x += d.vx * dt; d.y += d.vy * dt; d.z += d.vz * dt;
        if (groundAt) d.ground = groundAt(d.x, d.z);
        const rest = d.ground + DROP.rest;
        if (d.y < rest) {
          d.y = rest; d.vy *= -DROP.bounce; d.vx *= DROP.friction; d.vz *= DROP.friction;
          if (Math.abs(d.vy) < DROP.settle) { d.vx = d.vy = d.vz = 0; d.resting = true; }
        }
      } else d.y = d.ground + DROP.rest + Math.sin(this.time * DROP.bobRate + d.phase) * DROP.bob;
      let dist = Math.hypot(hero.x - d.x, hero.z - d.z);
      if (d.selfLock && dist > DROP.selfLockRange) d.selfLock = false;
      if (alive && d.age > DROP.magnetDelay && !d.selfLock && dist < radius) {
        if (!canAdd(d.item, d.count)) {
          if (dist < DROP.fullWarnRange && this.fullWarnT <= 0) { this.fullWarnT = DROP.fullWarnEvery; events.full.push(d); }
        } else {
          if (dist < DROP.collect) { this.drops.splice(i, 1); events.picked.push(d); continue; }
          // Pull at max(6, 12 − 2d) m/s, never past the explorer.
          const pull = Math.min(dist, Math.max(DROP.pullMin, DROP.pullMax - dist * 2) * dt);
          d.x += (hero.x - d.x) / dist * pull; d.z += (hero.z - d.z) / dist * pull; dist -= pull;
          if (groundAt) d.ground = groundAt(d.x, d.z);
        }
      }
      if (d.age >= d.life) { this.drops.splice(i, 1); events.expired.push(d); }
    }
    return events;
  }

  clear() { this.drops.length = 0; }
}
