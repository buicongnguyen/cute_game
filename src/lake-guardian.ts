/**
 * The Lake Guardian: a rare glowing koi under the biggest home water, the meadow lake (home:fish:2, 11 m across the
 * radius, 112 m south-east of the village). The user: "maybe there is some special fish under the big pond".
 *
 * Rules (pure, shared by the client, the offline actions and the server's fishHunt authority, like fish-hunting.ts):
 *  - When: it surfaces once in every GUARDIAN_CYCLE_MS (6 min) for GUARDIAN_UP_MS (2 min), at a moment seeded by the
 *    cycle number, so everyone sees it at the same time from the clock alone (no server state). GUARDIAN_STIR_MS before
 *    it rises the water stirs (rings and bubbles over the deep middle): a hint to stay by the shore.
 *  - Where: a slow wide loop in the lake, seeded the same way (its path depends on the time only).
 *  - Catch: harpoon only. It is in no FISH_WEIGHTS table, so no rod cast and no ordinary hunting slot can roll it; the
 *    hunt intent names it with GUARDIAN_SLOT and huntFish (fish-hunting.ts) validates the throw like any harpoon catch
 *    (equipped harpoon, shot cooldown, standing on the shore, aim inside the lake, reach) plus a wider hit radius.
 *  - Economy: one per explorer per GUARDIAN_COOLDOWN_MS (20 h, a cooldown rather than a calendar day so time zones do
 *    not matter); the save keeps `hunting.guardianAt`. It sells for 450 (a golden fish sells for 600), so even a
 *    daily catch is pocket money next to the ~8k/h a lake slot pays (the round-3 harpoon farm was ~200k/h).
 *  - Collection: it is a FISH entry (content.ts), so the journal's fish log lists it like every other fish.
 */
import type { FishHuntTarget, HuntPond, HuntingState } from './fish-hunting.ts';

export const GUARDIAN_ID = 'fish_guardian';
export const GUARDIAN_POND = 'home:fish:2';
/** The hunt intent's slot for the guardian (ordinary slots are 0..FISH_PER_WATER-1, at most 17). */
export const GUARDIAN_SLOT = 100;
export const GUARDIAN_CYCLE_MS = 6 * 60_000, GUARDIAN_UP_MS = 2 * 60_000, GUARDIAN_STIR_MS = 20_000;
/** Seconds it takes to rise or sink (the view fades its glow and depth over this). */
export const GUARDIAN_FADE_MS = 4_000;
export const GUARDIAN_COOLDOWN_MS = 20 * 3_600_000;
/** It is big (about 2 m): a throw within this of its centre hits (ordinary fish: 0.9). */
export const GUARDIAN_HIT_RADIUS = 1.2;
/** Fraction of the lake's radius its loop keeps to (inside the 0.3-0.62 band the ordinary fish swim, mostly beyond it). */
const LOOP = .58, SPEED = .55;

function hash(key: string) { let n = 2166136261; for (const c of key) n = Math.imul(n ^ c.charCodeAt(0), 16777619); n = Math.imul(n ^ (n >>> 16), 0x7feb352d); n = Math.imul(n ^ (n >>> 15), 0x846ca68b); return (n ^ (n >>> 16)) >>> 0; }
const fraction = (key: string) => hash(key) / 0x100000000;
const valid = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= Number.MAX_SAFE_INTEGER - GUARDIAN_COOLDOWN_MS;

export type GuardianPhase = 'deep' | 'stir' | 'up';
/**
 * Where the guardian is in its cycle at `now` (ms): 'stir' just before it rises, 'up' while it can be seen and caught,
 * else 'deep'. `rise` is 0..1 (depth and glow: it fades in over the first GUARDIAN_FADE_MS and out over the last).
 */
export function guardianPhase(now: number): { phase: GuardianPhase; rise: number; start: number; end: number } {
  if (!valid(now)) return { phase: 'deep', rise: 0, start: 0, end: 0 };
  const cycle = Math.floor(now / GUARDIAN_CYCLE_MS), base = cycle * GUARDIAN_CYCLE_MS;
  const start = base + GUARDIAN_STIR_MS + Math.floor(fraction(`guardian:${cycle}`) * (GUARDIAN_CYCLE_MS - GUARDIAN_UP_MS - GUARDIAN_STIR_MS)), end = start + GUARDIAN_UP_MS;
  if (now >= start && now < end) return { phase: 'up', rise: Math.min(1, (now - start) / GUARDIAN_FADE_MS, (end - now) / GUARDIAN_FADE_MS), start, end };
  return { phase: now >= start - GUARDIAN_STIR_MS && now < start ? 'stir' : 'deep', rise: 0, start, end };
}
/** The next moment it rises at or after `now` (for hints and tests). */
export function nextGuardianRise(now: number) {
  const p = guardianPhase(now); if (p.phase === 'up') return p.start;
  return now < p.start ? p.start : guardianPhase((Math.floor(now / GUARDIAN_CYCLE_MS) + 1) * GUARDIAN_CYCLE_MS).start;
}
/** True when this explorer may catch it again (none caught in the last GUARDIAN_COOLDOWN_MS). */
export function guardianReady(hunting: Pick<HuntingState, 'guardianAt'> | undefined, now: number) {
  const at = hunting?.guardianAt; return !valid(at) || !valid(now) || now - at >= GUARDIAN_COOLDOWN_MS;
}
export const guardianReadyAt = (hunting: Pick<HuntingState, 'guardianAt'> | undefined) => valid(hunting?.guardianAt) ? hunting!.guardianAt! + GUARDIAN_COOLDOWN_MS : 0;
/** Its loop in the lake at `now` (any time: the view also draws it sinking and rising). */
export function guardianPose(pond: Pick<HuntPond, 'x' | 'z' | 'rx' | 'rz'>, now: number) {
  const at = (ms: number) => {
    const s = ms / 1000, r = pond.rx * LOOP, a = s * SPEED / r + fraction('guardian:phase') * Math.PI * 2;
    // A lazy loop that swells and narrows (never a perfect circle) and stays well inside the shore.
    const k = .78 + .22 * Math.sin(a * 2.5 + 1.3);
    return { x: pond.x + Math.cos(a) * r * k, z: pond.z + Math.sin(a) * pond.rz * LOOP * k * .9 };
  };
  const p = at(now), q = at(now + 80);
  return { x: p.x, z: p.z, facing: Math.atan2(q.x - p.x, q.z - p.z) };
}
/** Its size today (cm): seeded by the up window, so client and server agree for the same clock. */
export const guardianSize = (start: number) => Math.round(180 + fraction(`guardian:size:${Math.floor(start / GUARDIAN_CYCLE_MS)}`) * 80);
/**
 * The guardian as a hunting target, or null: only in its lake, while it is up, and only for an explorer whose last
 * catch is GUARDIAN_COOLDOWN_MS old. Same shape as an ordinary FishHuntTarget, with slot GUARDIAN_SLOT.
 */
export function guardianTarget(pond: HuntPond, now: number, hunting?: Pick<HuntingState, 'guardianAt'>): FishHuntTarget | null {
  if (pond.id !== GUARDIAN_POND || !guardianReady(hunting, now)) return null;
  const p = guardianPhase(now); if (p.phase !== 'up') return null;
  const pose = guardianPose(pond, now);
  return { slot: GUARDIAN_SLOT, id: GUARDIAN_ID, size: guardianSize(p.start), x: pose.x, z: pose.z, facing: pose.facing };
}
