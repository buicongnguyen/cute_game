import type { HitSource } from './elite-roles.ts';

/**
 * Breakable scenery (the owner's design, 2026-10-14): on ONE wild planet, the Ice planet (270 snow pines and 110 snow
 * rocks, the densest trees and rocks of any wild world), the trees and stones that block your way can be worn down and
 * broken. Shared rules only (no three.js): the solo game (breakables-view.ts) and the server (combat-authority.mjs)
 * run the same ledger, so online the server decides every hit, break and regrowth and everyone sees the same.
 *
 * - It takes a lot: about 9 basic hits fell a tree, 14 crack a stone; skills, Quake, a dive or the power strike count
 *   for more but still need several. Pets and summons never wear scenery down.
 * - Boss rule: while a boss is fighting someone, nothing within BREAK.bossRadius m of it takes damage (the hit still
 *   shakes and chips); the damage already done waits and counts again after the fight. Boss attacks never touch scenery.
 * - A broken piece leaves a stump or rubble, drops a little wood (trees, capped per day; there is no stone material),
 *   and regrows after 3-5 minutes, but never while someone stands on its spot.
 */
export const BREAK_PLANET = 'ice';
export type BreakClass = 'tree' | 'stone';
/** Scenery types that may break, by class. Everything else (spires, snowmen, rim rows, the village...) never does. */
export const BREAKABLE_TYPES: Readonly<Record<string, BreakClass>> = { snow_pine: 'tree', snow_rock: 'stone' };
export const BREAK = {
  /** Hit points of each class, in basic hits (a basic melee hit is worth 1). */
  hp: { tree: 9, stone: 14 } as Record<BreakClass, number>,
  /** What one hit from each source is worth, per class. A stone mostly cracks under Quake, the power strike and a dive. */
  worth: {
    tree: { melee: 1, shot: .6, skill: 1.6, quake: 2, dive: 2, power: 3, pet: 0, summon: 0 },
    stone: { melee: 1, shot: .35, skill: 1, quake: 3.5, dive: 3, power: 4, pet: 0, summon: 0 },
  } as Record<BreakClass, Record<HitSource, number>>,
  /** Seconds before the same piece counts another hit (a spin's ten ticks are one blow). */
  rehit: .3,
  /** A boss fighting within this many metres holds the piece (no damage). */
  bossRadius: 28,
  /** Regrowth after this many seconds (a seeded value in the range per break). */
  regrow: [180, 300] as const,
  /** Seconds of the sprout-and-grow animation. */
  grow: 1.4,
  /** Nobody may stand this close (m, plus the piece's radius) when it regrows. */
  clear: .9,
  /** Wood from a felled tree, and the most a day (there is no stone material, so a stone drops nothing). */
  wood: { per: 1, daily: 6 },
  /** How far (m, plus the piece's radius) from the explorer a hit of each source may land: the server's check. */
  reach: { melee: 4.5, shot: 16, skill: 12, quake: 9, dive: 8, power: 14, pet: 0, summon: 0 } as Record<HitSource, number>,
} as const;

export interface BreakPiece { id: string; type: string; x: number; z: number; /** Collision radius (m). */ r: number }
export interface BreakBoss { x: number; z: number; hp: number; /** Fighting someone (aggro on a player). */ aggro: boolean }
export interface BreakEntry { id: string; hp: number; max: number; /** Seconds (ledger clock) when it regrows; set once broken. */ regrowAt?: number; /** Damage stage 0..3 (cracks). */ stage: number }
export type BreakOutcome = 'none' | 'wear' | 'held' | 'break';
export interface BreakResult { outcome: BreakOutcome; piece: BreakPiece; hp: number; max: number; stage: number; regrowAt?: number }

export const breakClass = (type: string): BreakClass | undefined => BREAKABLE_TYPES[type];
/** The stable id of a piece: its type and its spot to a tenth of a metre (the same on every client and the server). */
export const pieceId = (type: string, x: number, z: number) => `${type}@${Math.round(x * 10)}:${Math.round(z * 10)}`;
/** The piece an id names (type and spot), or null when it is not a breakable id. */
export function parsePieceId(id: unknown): { type: string; x: number; z: number } | null {
  if (typeof id !== 'string' || id.length > 40) return null;
  const m = /^([a-z_]+)@(-?\d{1,5}):(-?\d{1,5})$/.exec(id);
  if (!m || !breakClass(m[1])) return null;
  return { type: m[1], x: Number(m[2]) / 10, z: Number(m[3]) / 10 };
}
/** Damage stage 0..3 from hit points left: cracks show at a third, two thirds and nearly broken. */
export function breakStage(hp: number, max: number) { if (!(max > 0) || hp >= max) return 0; const done = 1 - hp / max; return done >= .75 ? 3 : done >= .4 ? 2 : 1; }
/** What one hit of `source` is worth on a piece of `type` (0: it only shakes). */
export function hitWorth(type: string, source: HitSource | undefined) { const c = breakClass(type); return c ? BREAK.worth[c][source ?? 'melee'] ?? 0 : 0; }
/** A creature's AI phase means it is after someone (hud-combat.ts aggro; the server sees the same phases). */
export const fighting = (phase: unknown) => typeof phase === 'string' && phase !== '' && phase !== 'idle' && phase !== 'return';
/** A boss is fighting within BREAK.bossRadius m of (x, z): the piece there is held. */
export function bossHolds(x: number, z: number, bosses: Iterable<BreakBoss>) { for (const b of bosses) if (b.hp > 0 && b.aggro && Math.hypot(b.x - x, b.z - z) <= BREAK.bossRadius) return true; return false; }
/** The pieces of a planned world that may break: only breakable types that block (rim rows and walk-through cover never). */
export function breakablePieces(planet: string, decor: readonly { type: string; x: number; z: number; radius: number }[]): BreakPiece[] {
  if (planet !== BREAK_PLANET) return [];
  const out: BreakPiece[] = [];
  for (const p of decor) if (p.radius > 0 && breakClass(p.type)) out.push({ id: pieceId(p.type, p.x, p.z), type: p.type, x: p.x, z: p.z, r: p.radius });
  return out;
}
/** A hit of `source` from an explorer at `from` may reach the piece (the server's distance check). */
export function inReach(piece: { x: number; z: number; r: number }, from: { x: number; z: number }, source: HitSource) { return Math.hypot(piece.x - from.x, piece.z - from.z) <= (BREAK.reach[source] ?? 0) + piece.r; }

/**
 * The hit points of every damaged or broken piece, keyed by id (untouched pieces have no entry). `now` is any steady
 * clock in seconds; `random` seeds the regrowth time (tests pin it).
 */
export class BreakLedger {
  readonly entries = new Map<string, BreakEntry>();
  private last = new Map<string, number>();
  private random: () => number;
  constructor(random: () => number = Math.random) { this.random = random; }
  get(id: string) { return this.entries.get(id); }
  broken(id: string) { return this.entries.get(id)?.regrowAt !== undefined; }
  /**
   * One hit of `source` on `piece`. 'none': nothing (a pet's, a summon's, too soon after the last, or already broken);
   * 'held': a boss holds it (it shakes, no damage); 'wear': it took damage; 'break': it broke now.
   */
  hit(piece: BreakPiece, source: HitSource | undefined, now: number, held = false): BreakResult {
    const c = breakClass(piece.type), max = c ? BREAK.hp[c] : 0, e = this.entries.get(piece.id);
    const none = (outcome: BreakOutcome = 'none'): BreakResult => ({ outcome, piece, hp: e?.hp ?? max, max, stage: e?.stage ?? 0, ...(e?.regrowAt !== undefined ? { regrowAt: e.regrowAt } : {}) });
    if (!c || e?.regrowAt !== undefined) return none();
    const worth = hitWorth(piece.type, source);
    if (!(worth > 0)) return none();
    const last = this.last.get(piece.id);
    if (last !== undefined && now - last < BREAK.rehit && now >= last) return none();
    this.last.set(piece.id, now);
    if (held) return none('held');
    const entry = e ?? { id: piece.id, hp: max, max, stage: 0 };
    entry.hp = Math.max(0, Math.round((entry.hp - worth) * 100) / 100); entry.stage = breakStage(entry.hp, max);
    this.entries.set(piece.id, entry);
    if (entry.hp > 0) return { outcome: 'wear', piece, hp: entry.hp, max, stage: entry.stage };
    entry.stage = 3; entry.regrowAt = now + BREAK.regrow[0] + this.random() * (BREAK.regrow[1] - BREAK.regrow[0]);
    return { outcome: 'break', piece, hp: 0, max, stage: 3, regrowAt: entry.regrowAt };
  }
  /** Broken pieces whose time has come and whose spot is free (`occupied(x, z, r)`): removed from the ledger and returned. */
  regrow(now: number, pieces: (id: string) => BreakPiece | undefined, occupied: (x: number, z: number, r: number) => boolean): string[] {
    const out: string[] = [];
    for (const e of this.entries.values()) {
      if (e.regrowAt === undefined || now < e.regrowAt) continue;
      const known = pieces(e.id), p = known ?? parsePieceId(e.id), r = known ? known.r : .6;
      if (p && occupied(p.x, p.z, r + BREAK.clear)) continue;
      this.entries.delete(e.id); this.last.delete(e.id); out.push(e.id);
    }
    return out;
  }
  /** Everything, for a newcomer: [id, hp, regrowAt in seconds from now or -1]. */
  snapshot(now: number): [string, number, number][] { return [...this.entries.values()].map(e => [e.id, e.hp, e.regrowAt === undefined ? -1 : Math.max(0, e.regrowAt - now)]); }
  clear() { this.entries.clear(); this.last.clear(); }
}

/** Day key (UTC) for the daily wood cap, stored in worldRewards.resourceReadyAt (an existing, sanitised record of numbers). */
export const woodKey = (now: number) => `break-wood:${new Date(now).toISOString().slice(0, 10)}`;
/**
 * Grants the wood of a felled tree to a save, within the daily cap: returns how many were given (0 at the cap or for a
 * stone). Old days' counters are dropped. `add` puts items in the bag (model.ts addItem).
 */
export function grantBreakDrop(s: { worldRewards: { resourceReadyAt: Record<string, number> } }, type: string, now: number, add: (id: string, n: number) => unknown): number {
  if (breakClass(type) !== 'tree') return 0;
  const key = woodKey(now), rec = s.worldRewards.resourceReadyAt, had = rec[key] ?? 0;
  for (const k of Object.keys(rec)) if (k.startsWith('break-wood:') && k !== key) delete rec[k];
  const n = Math.min(BREAK.wood.per, BREAK.wood.daily - had);
  if (n <= 0) return 0;
  if (add('wood', n) === false) return 0;
  rec[key] = had + n; return n;
}

/** A combat effect, as far as breakables read it (combat.ts CombatEffect). */
export interface BreakEffect { kind: string; x: number; z: number; radius: number; facing?: number; arc?: number; width?: number; look?: string; quiet?: boolean; source?: HitSource }
/** The effect's area reaches the piece: a swing's arc, an area's ring, a shot's impact, a beam, a rush. */
export function effectReaches(e: BreakEffect, p: { x: number; z: number; r: number }): boolean {
  if (!Number.isFinite(e.x + e.z + e.radius)) return false;
  const dx = p.x - e.x, dz = p.z - e.z, d = Math.hypot(dx, dz), facing = e.facing ?? 0;
  if (e.kind === 'ring') return d <= e.radius + p.r;
  if (e.kind === 'impact') return d <= Math.max(.6, e.radius) + p.r;
  if (e.kind === 'arc') {
    if (d > e.radius + p.r) return false; if (d <= p.r + .3) return true;
    const half = (e.radius <= 1.85 ? 1.4 : Math.min(6.2, e.arc ?? 2.2)) / 2, along = (dx * Math.sin(facing) + dz * Math.cos(facing)) / d;
    return Math.acos(Math.max(-1, Math.min(1, along))) <= half + Math.asin(Math.min(1, p.r / d));
  }
  if (e.kind === 'beam' || (e.kind === 'cast' && e.look === 'rush')) {
    const len = e.kind === 'beam' ? e.radius : Math.max(4, e.radius), half = (e.width ?? 1.2) / 2, along = dx * Math.sin(facing) + dz * Math.cos(facing), side = Math.abs(dx * Math.cos(facing) - dz * Math.sin(facing));
    return along >= -p.r && along <= len + p.r && side <= half + p.r;
  }
  return false;
}
