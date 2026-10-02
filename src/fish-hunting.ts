import { FISH, FISH_WEIGHTS, ITEMS } from './content.ts';
import { FISH_PER_WATER } from './fishing.ts';
import { zoneAt } from './environments.ts';
import { grantCatch, type SaveState } from './model.ts';

export const FISH_HUNT_COOLDOWN_MS = 1300;
/** A caught slot restocks after 90 s with a freshly rolled species (review: a 12 s restock of a fixed golden fish paid ~200k
 * energy an hour). 90 s keeps a lake pond near 8k energy an hour from one spot, under the best rod there (~10k, steady rod). */
export const FISH_HUNT_RESTOCK_MS = 90_000;
export const FISH_HUNT_HIT_RADIUS = .9;
const HUNT_PLANETS = ['home', 'candy', 'ice', 'toy', 'jungle', 'shadow'];
const MAX_TIME = Number.MAX_SAFE_INTEGER - FISH_HUNT_RESTOCK_MS;
interface Point { x: number; z: number }
export interface HuntPond extends Point { id: string; rx: number; rz: number; surface: number; waterId: string }
export interface FishHuntTarget extends Point { slot: number; id: string; size: number; facing: number }
export interface HuntingState { lastShotAt: number; readyAt: Record<string, number>; /** Fish caught per slot: seeds the species that restocks there. */ caught?: Record<string, number>; /** Distinguishes an initial zero timestamp from a shot at time zero. */ hasShot?: boolean }
export interface FishHuntIntent { weaponId: string; pondId: string; slot: number; aim: Point }
export interface FishHuntResult { hit: boolean; count: 0 | 1; id: string; size: number; huge: false; pondId: string; slot: number; readyAt: number; shotReadyAt: number; serverNow: number }
const validTime = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= MAX_TIME;
const point = (p: unknown): p is Point => !!p && typeof p === 'object' && Number.isFinite((p as Point).x) && Number.isFinite((p as Point).z);

/** Same geometry and stable entity IDs as World.makePond and rod-fishing validation. */
export function huntingPonds(planet: string): HuntPond[] {
  const raw = planet === 'home' ? [[-7.5, 11.2, 3.3], [10, 52, 9], [40, 105, 11], [-70, 35, 8], [-105, -30, 7]] : HUNT_PLANETS.includes(planet) ? Array.from({ length: 4 }, (_, i) => [Math.cos(i * Math.PI / 2 + .4) * (38 + i * 17), Math.sin(i * Math.PI / 2 + .4) * (38 + i * 17), 6 + i * .6]) : [];
  return raw.map(([x, z, r], i) => ({ id: `${planet}:fish:${i}`, x, z, rx: r, rz: r, surface: .3, waterId: planet === 'home' ? Math.hypot(x, z) < 18 ? 'home' : zoneAt({ x, z }) === 'swamp' ? 'swamp' : 'lake' : planet }));
}
export function huntingPondAt(planet: string, x: number, z: number): HuntPond | null { return huntingPonds(planet).find(p => Math.hypot(p.x - x, p.z - z) < .01) ?? null; }
export const fishHuntKey = (pondId: string, slot: number) => `${pondId}:${slot}`;
function hash(key: string) { let n = 2166136261; for (const c of key) n = Math.imul(n ^ c.charCodeAt(0), 16777619); n = Math.imul(n ^ (n >>> 16), 0x7feb352d); n = Math.imul(n ^ (n >>> 15), 0x846ca68b); return (n ^ (n >>> 16)) >>> 0; }
const fraction = (key: string) => hash(key) / 0x100000000;

/** Fish caught from this slot so far (0 for a fresh save): the restocked species is rolled from it. */
export const huntCatches = (hunting: Pick<HuntingState, 'caught'> | undefined, key: string) => hunting?.caught?.[key] ?? 0;
/**
 * The pond's normal weights without junk and without legendary fish: those stay line-fishing prizes (a slot that
 * always held a golden fish paid ~200k energy an hour from one spot on the shore).
 */
const huntChoices = (waterId: string) => (FISH_WEIGHTS[waterId] ?? []).filter(([id]) => FISH[id] && FISH[id].rarity !== 'junk' && FISH[id].rarity !== 'legendary');
/**
 * A slot's fish: the species and size are rolled from the normal weights, seeded by `${key}:${catches}`, so every
 * restock brings a new roll that the client and the server derive alike from the save (never from a client's claim).
 * The swim path stays fixed by pond/slot. The rod view stocks its fish from the same targets (main.ts pondStock).
 */
export function fishHuntTarget(pond: HuntPond, slot: number, now: number, hunting?: Pick<HuntingState, 'caught'>): FishHuntTarget | null {
  if (!validTime(now) || !Number.isSafeInteger(slot) || slot < 0 || slot >= (FISH_PER_WATER[pond.waterId] ?? 0)) return null;
  const choices = huntChoices(pond.waterId);
  if (!choices.length) return null;
  const key = fishHuntKey(pond.id, slot), stock = `${key}:${huntCatches(hunting, key)}`; let roll = fraction(stock) * choices.reduce((sum, [, weight]) => sum + weight, 0), id = choices.at(-1)![0];
  for (const [candidate, weight] of choices) if ((roll -= weight) <= 0) { id = candidate; break; }
  const orbit = .3 + fraction(`${key}:orbit`) * .32, radius = pond.rx * orbit, speed = .35 + fraction(`${key}:speed`) * .15;
  const angle = fraction(`${key}:phase`) * Math.PI * 2 + (now / 1000 * speed / radius) % (Math.PI * 2);
  const size = Math.round(FISH[id].size[0] + (FISH[id].size[1] - FISH[id].size[0]) * (.25 + fraction(`${stock}:size`) * .4));
  return { slot, id, size, x: pond.x + Math.cos(angle) * radius, z: pond.z + Math.sin(angle) * pond.rz * orbit * .8, facing: Math.atan2(-Math.sin(angle) * pond.rx, Math.cos(angle) * pond.rz * .8) };
}
export function fishHuntTargets(pond: HuntPond, now: number, hunting?: Pick<HuntingState, 'caught'>): FishHuntTarget[] {
  return Array.from({ length: FISH_PER_WATER[pond.waterId] ?? 0 }, (_, slot) => fishHuntTarget(pond, slot, now, hunting)).filter((target): target is FishHuntTarget => target !== null);
}
/** Save/authority input is limited to real pond slots and one restock window in the future. */
export function parseHunting(raw: unknown, now = Date.now()): HuntingState | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || !validTime(now)) return undefined;
  const value = raw as Record<string, unknown>, readyAt: Record<string, number> = {};
  const object = (v: unknown) => v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {};
  const input = object(value.readyAt), counts = object(value.caught), caught: Record<string, number> = {};
  for (const planet of HUNT_PLANETS) for (const pond of huntingPonds(planet)) for (let slot = 0; slot < (FISH_PER_WATER[pond.waterId] ?? 0); slot++) {
    const key = fishHuntKey(pond.id, slot), at = input[key], n = counts[key]; if (validTime(at) && at <= now + FISH_HUNT_RESTOCK_MS) readyAt[key] = at;
    if (Number.isSafeInteger(n) && (n as number) > 0) caught[key] = Math.min(1e9, n as number);
  }
  // Reset implausible future timestamps instead of repeatedly clamping them on every rejected request.
  const validShot = validTime(value.lastShotAt) && value.lastShotAt <= now;
  return { lastShotAt: validShot ? value.lastShotAt as number : 0, readyAt, ...(Object.keys(caught).length ? { caught } : {}), ...(validShot && value.hasShot === true ? { hasShot: true } : {}) };
}

/** Offline uses the player's position; the server must supply its own authenticated peer position. */
export function huntFish(s: SaveState, intent: FishHuntIntent, from: Point, now = Date.now()): FishHuntResult | null {
  if (!intent || intent.weaponId !== 'harpoon' || s.gear.weapon !== 'harpoon' || s.gear.disguise || !(s.bag.harpoon! >= 1) || s.hp <= 0 || !validTime(now) || !point(from) || !point(intent.aim)) return null;
  const weapon = ITEMS.harpoon?.weapon, pond = huntingPonds(s.planet).find(p => p.id === intent.pondId);
  if (!weapon || !pond || s.hunting && (s.hunting.hasShot || s.hunting.lastShotAt > 0) && now - s.hunting.lastShotAt < FISH_HUNT_COOLDOWN_MS) return null;
  const target = fishHuntTarget(pond, intent.slot, now, s.hunting); if (!target) return null;
  const key = fishHuntKey(pond.id, target.slot), readyAt = s.hunting?.readyAt[key] ?? 0;
  if (now < readyAt || Math.hypot((intent.aim.x - pond.x) / pond.rx, (intent.aim.z - pond.z) / pond.rz) > 1 || Math.hypot(from.x - pond.x, from.z - pond.z) > pond.rx + 3.05 || Math.hypot(from.x - intent.aim.x, from.z - intent.aim.z) > Math.min(16, weapon.range)) return null;
  const hit = Math.hypot(target.x - intent.aim.x, target.z - intent.aim.z) <= FISH_HUNT_HIT_RADIUS;
  // A failed inventory grant keeps both the fish and the shot available.
  if (hit && !grantCatch(s, target.id, target.size, false)) return null;
  const hunting = s.hunting ??= { lastShotAt: 0, readyAt: {} }; hunting.lastShotAt = now; hunting.hasShot = true;
  if (hit) { hunting.readyAt[key] = now + FISH_HUNT_RESTOCK_MS; (hunting.caught ??= {})[key] = Math.min(1e9, huntCatches(hunting, key) + 1); }
  return { hit, count: hit ? 1 : 0, id: target.id, size: target.size, huge: false, pondId: pond.id, slot: target.slot, readyAt: hunting.readyAt[key] ?? 0, shotReadyAt: now + FISH_HUNT_COOLDOWN_MS, serverNow: now };
}
