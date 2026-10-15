/**
 * Arrival flags (docs/FIX-PLAN.md 5.5, the owner's "flags put on a place to show that we have arrived there").
 * Pure rules over the save; place-flags-view.ts draws the flags in the world and on the map, goals-ui.ts lists them.
 *
 * Sixteen places, each reached once:
 * - the four wilds of the home map (environments.ts zoneAt): the flag goes up beside the explorer where they first walk
 *   in, at least a step outside the village hedge;
 * - four home landmarks, reached within `reach` metres of them: the Multiworld Gate (ctf.ts GATE), the Delvers' Vault
 *   circle (dungeon-rules.ts DUNGEON.lobby), the big meadow lake of the Lake Guardian (fish-hunting.ts home pond 2) and
 *   Cinderpeak, where the Colossus stands (colossus-content.ts COLOSSUS_SCHEDULE); the flag stands at a fixed spot;
 * - the landing pad of each of the eight other planets, reached on landing; the flag stands beside the pad.
 * Clover Village is where every explorer starts, so it is home rather than a place to reach.
 *
 * Saved as `placeFlags` ({ place: [x, z, when] }). Older saves start with a flag on every planet they had landed on
 * (s.visited) and none in the wilds or at the landmarks: those go up the next time the explorer walks there.
 * Flags are personal: online the server's save has none, so the browser keeps them for the account (place-flags-view.ts).
 */
import { PLANETS, type PlanetId } from './content.ts';
import { zoneAt } from './environments.ts';

export type PlaceKind = 'wild' | 'landmark' | 'planet';
export interface PlaceDef {
  id: string; name: string; icon: string; planet: PlanetId; kind: PlaceKind;
  /** Where the flag stands (landmarks and planets); wild flags stand where the explorer walked in. */
  spot: { x: number; z: number };
  /** Landmarks: how close counts as arriving (metres from `at`). */
  at?: { x: number; z: number }; reach?: number;
  /** A hint for the Goals panel: where to go. */
  hint: string;
}
/** One planted flag: x, z (metres, one decimal) and when (ms). */
export type FlagSpot = [number, number, number];
export type PlaceFlags = Record<string, FlagSpot>;

const WILDS = [
  { id: 'forest', name: 'Mushroom Forest', icon: '🍄', hint: 'Out of the west gate.' },
  { id: 'meadow', name: 'Blue Lake Meadow', icon: '🌊', hint: 'Out of the south gate.' },
  { id: 'swamp', name: 'Chomper Swamp', icon: '🌿', hint: 'Out of the north gate.' },
  { id: 'canyon', name: 'Redrock Canyon', icon: '🏜️', hint: 'Out of the east gate.' },
] as const;
/** The landing pad flag: beside the explorer's landing spot (0, 3.6), clear of the starship and the crystal veins. */
export const PAD_FLAG = { x: 3.2, z: 5.8 } as const;
/** Wild flags stand at least this far from the village centre: outside the hedge ring (radius 18) and its gate posts. */
export const WILD_FLAG_MIN_R = 20.5;
/** How far from the explorer a wild flag goes up (metres). */
export const FLAG_STEP = 1.5;

export const PLACES: readonly PlaceDef[] = [
  ...WILDS.map(w => ({ id: w.id, name: w.name, icon: w.icon, planet: 'home' as PlanetId, kind: 'wild' as const, spot: { x: 0, z: 0 }, hint: w.hint })),
  { id: 'gate', name: 'Multiworld Gate', icon: '🌀', planet: 'home', kind: 'landmark', at: { x: -12, z: 29 }, reach: 7, spot: { x: -15.2, z: 30.6 }, hint: 'Just past the south gate, to the west of the road.' },
  { id: 'vault', name: "The Delvers' Vault", icon: '🗝️', planet: 'home', kind: 'landmark', at: { x: 11, z: 27.5 }, reach: 7, spot: { x: 16.2, z: 28.6 }, hint: 'Just past the south gate, to the east of the road.' },
  { id: 'lake', name: 'Guardian Lake', icon: '🎏', planet: 'home', kind: 'landmark', at: { x: 40, z: 105 }, reach: 17, spot: { x: 35.4, z: 92.6 }, hint: 'The big lake far south in the meadow.' },
  { id: 'cinderpeak', name: 'Cinderpeak', icon: '🌋', planet: 'home', kind: 'landmark', at: { x: 78, z: 0 }, reach: 22, spot: { x: 53.5, z: -8.5 }, hint: 'Far east in the canyon, where the Colossus stands.' },
  ...(Object.keys(PLANETS) as PlanetId[]).filter(id => id !== 'home').map(id => ({ id, name: PLANETS[id].name, icon: PLANETS[id].icon, planet: id, kind: 'planet' as const, spot: { ...PAD_FLAG }, hint: 'Land there with the starship.' })),
];
const BY_ID = new Map(PLACES.map(p => [p.id, p]));
export const placeById = (id: string) => BY_ID.get(id);

/** The place the explorer is arriving at, standing at x, z on `planet`: a landmark in reach, a planet's pad, or a wild. */
export function placeAt(planet: PlanetId | string, x: number, z: number): PlaceDef | null {
  if (!Number.isFinite(x) || !Number.isFinite(z)) return null;
  if (planet !== 'home') return BY_ID.get(planet) ?? null;
  for (const p of PLACES) if (p.kind === 'landmark' && p.at && Math.hypot(x - p.at.x, z - p.at.z) <= (p.reach ?? 0)) return p;
  const zone = zoneAt({ x, z });
  return zone === 'home' ? null : BY_ID.get(zone) ?? null;
}

const tenth = (n: number) => Math.round(n * 10) / 10;
/**
 * Where a flag for `place` goes up when the explorer stands at x, z facing `facing` (atan2(dx, dz)): a landmark's or
 * planet's own spot, or for a wild a step beside the explorer, first to the right, else the left, behind or ahead
 * (`free` says whether a spot is clear of trees and rocks), pushed out past the village hedge.
 */
export function flagSpot(place: PlaceDef, x: number, z: number, facing = 0, free: (x: number, z: number) => boolean = () => true): { x: number; z: number } {
  if (place.kind !== 'wild') return { ...place.spot };
  const out = (px: number, pz: number) => { const d = Math.hypot(px, pz); return d >= WILD_FLAG_MIN_R || d < 1e-6 ? { x: px, z: pz } : { x: px / d * WILD_FLAG_MIN_R, z: pz / d * WILD_FLAG_MIN_R }; };
  const f = Number.isFinite(facing) ? facing : 0, ax = Math.sin(f), az = Math.cos(f), rx = Math.cos(f), rz = -Math.sin(f);
  // Right, left, back-right, back-left, ahead-right: the first clear one (or the first, when none is).
  const tries = [[rx, rz], [-rx, -rz], [rx - ax, rz - az], [-rx - ax, -rz - az], [rx + ax, rz + az]].map(([dx, dz]) => { const l = Math.hypot(dx, dz) || 1; return out(x + dx / l * FLAG_STEP, z + dz / l * FLAG_STEP); });
  // A spot pushed out past the hedge may land on the explorer's toes: it must stay a step away.
  const clear = (p: { x: number; z: number }) => Math.hypot(p.x - x, p.z - z) >= FLAG_STEP * .7;
  const pick = tries.find(p => clear(p) && free(p.x, p.z)) ?? tries.find(clear) ?? tries[0];
  return { x: tenth(pick.x), z: tenth(pick.z) };
}

/** Plants the flag for `place` if it has none yet. True when a new flag went up. */
export function plantFlag(flags: PlaceFlags, place: PlaceDef, spot: { x: number; z: number }, now = Date.now()): boolean {
  if (Object.hasOwn(flags, place.id) || !Number.isFinite(spot.x) || !Number.isFinite(spot.z)) return false;
  flags[place.id] = [tenth(spot.x), tenth(spot.z), Number.isFinite(now) && now > 0 ? Math.round(now) : 0];
  return true;
}

/** The flags an older save (or a fresh one) starts with: every planet it has landed on. Silent: no toast, no sound. */
export function backfillFlags(s: { visited?: readonly string[] }): PlaceFlags {
  const flags: PlaceFlags = {};
  for (const id of s.visited ?? []) { const p = BY_ID.get(id); if (p?.kind === 'planet') plantFlag(flags, p, p.spot, 0); }
  return flags;
}

/** Reads `placeFlags` from a save: known places only, finite spots on the map. Undefined when there is nothing usable. */
export function parsePlaceFlags(v: unknown): PlaceFlags | undefined {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return undefined;
  const out: PlaceFlags = {};
  for (const [id, raw] of Object.entries(v as Record<string, unknown>)) {
    if (!BY_ID.has(id) || !Array.isArray(raw) || raw.length < 2) continue;
    const [x, z, at] = raw as unknown[];
    if (typeof x !== 'number' || typeof z !== 'number' || !Number.isFinite(x) || !Number.isFinite(z) || Math.abs(x) > 200 || Math.abs(z) > 200) continue;
    out[id] = [tenth(x), tenth(z), typeof at === 'number' && Number.isSafeInteger(at) && at > 0 ? at : 0];
  }
  return out;
}

export interface PlacesCount { done: number; total: number }
export function placesReached(flags: PlaceFlags | undefined): PlacesCount {
  return { done: PLACES.filter(p => flags && Object.hasOwn(flags, p.id)).length, total: PLACES.length };
}
/** The flags standing on one world, for the 3D view and the map. */
export function flagsOn(flags: PlaceFlags | undefined, planet: PlanetId | string): { id: string; x: number; z: number; at: number }[] {
  const out: { id: string; x: number; z: number; at: number }[] = [];
  if (flags) for (const p of PLACES) if (p.planet === planet && Object.hasOwn(flags, p.id)) { const [x, z, at] = flags[p.id]; out.push({ id: p.id, x, z, at }); }
  return out;
}
/** A short key of the flags (the HUD redraws only when it changes). */
export const flagsKey = (flags: PlaceFlags | undefined) => flags ? Object.keys(flags).length : 0;
