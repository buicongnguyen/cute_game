import { ITEMS, PLANETS, canonicalItem, type Inventory, type PlanetId } from './content.ts';

/**
 * Bags dropped where the explorer fell, like the reference (Zoo Pet `onPlayerDeath`: the whole backpack is cleared into
 * a bag at the spot; `lootBags` keep x, z, planet, items and the time; a bag lasts `X_=864e5` = 24 hours and at most 10
 * are kept, `.slice(-10)`). Picking one up puts what fits into the backpack and leaves the rest in the bag ("Túi đầy!
 * Vẫn còn đồ trong hũ."). Worn gear, the chest, level and energy are never dropped.
 *
 * Here the bags live in the save (server-authoritative online: only the owner's account holds them, the server checks
 * the spot and the lifetime). Where the reference throws an 11th bag's oldest away, the oldest is banked into the chest
 * instead, so dying often never destroys items that were still within their 24 hours.
 */
export interface DeathBag { id: string; x: number; z: number; planet: PlanetId; items: Inventory; at: number }
export const DEATH_BAG_MS = 24 * 3600_000, MAX_DEATH_BAGS = 10, DEATH_BAG_REACH = 1.6;
export const bagAlive = (bag: DeathBag, now: number) => now - bag.at < DEATH_BAG_MS;
/** Bags still within their lifetime (on `planet` when given), oldest first. */
export function liveBags(s: { deathBags?: DeathBag[] }, now: number, planet?: string) { return (s.deathBags ?? []).filter(b => bagAlive(b, now) && (planet === undefined || b.planet === planet)); }
/** Drops expired bags (their items are gone, as in the reference). */
export function pruneBags(s: { deathBags?: DeathBag[] }, now: number) { if (!s.deathBags) return; s.deathBags = s.deathBags.filter(b => bagAlive(b, now)); if (!s.deathBags.length) delete s.deathBags; }
export const bagCount = (bag: DeathBag) => Object.values(bag.items).reduce((n: number, v) => n + (v ?? 0), 0);
/** Time left as "23h 05m" / "4m". */
export function bagTimeLeft(bag: DeathBag, now: number) { const ms = Math.max(0, bag.at + DEATH_BAG_MS - now), h = Math.floor(ms / 3600_000), m = Math.floor(ms % 3600_000 / 60_000); return h ? `${h}h ${String(m).padStart(2, '0')}m` : `${Math.max(1, m)}m`; }
/** A fresh id for a bag dropped at `now`, unique within the save. */
export function bagId(s: { deathBags?: DeathBag[] }, now: number) { let id = `b${now.toString(36)}`, n = 0; while ((s.deathBags ?? []).some(b => b.id === id)) id = `b${now.toString(36)}-${++n}`; return id; }
/** The saved bags, checked: unknown items and bad spots are dropped; legacy `dropped` (one bag, no time) becomes a bag dropped at `savedAt`. */
export function parseDeathBags(raw: unknown, legacy: unknown, savedAt: number, inventory: (data: unknown) => Inventory): DeathBag[] {
  const record = (v: unknown): v is Record<string, any> => !!v && typeof v === 'object' && !Array.isArray(v);
  const planet = (v: unknown) => { const id = v === 'sky' ? 'cloud' : v === 'dark' ? 'shadow' : v; return typeof id === 'string' && Object.hasOwn(PLANETS, id) ? id as PlanetId : null; };
  const out: DeathBag[] = [];
  const add = (b: unknown, fallbackAt: number) => {
    if (!record(b) || !Number.isFinite(b.x) || !Number.isFinite(b.z) || !planet(b.planet)) return;
    const items = inventory(b.items); if (!Object.keys(items).length) return;
    const at = typeof b.at === 'number' && Number.isSafeInteger(b.at) && b.at >= 0 ? b.at : fallbackAt;
    const id = typeof b.id === 'string' && /^[a-z0-9-]{1,40}$/.test(b.id) && !out.some(o => o.id === b.id) ? b.id : bagId({ deathBags: out }, at);
    out.push({ id, x: b.x, z: b.z, planet: planet(b.planet)!, items, at });
  };
  add(legacy, savedAt);
  if (Array.isArray(raw)) for (const b of raw.slice(-MAX_DEATH_BAGS * 2)) add(b, savedAt);
  return out.sort((a, b) => a.at - b.at).slice(-MAX_DEATH_BAGS);
}
/** An item list for a toast: "3 Carrot, 1 Leather and 2 more". */
export function bagLine(items: Inventory, name: (id: string) => string, max = 3) {
  const list = Object.entries(items).filter(([id, n]) => (n ?? 0) > 0 && Object.hasOwn(ITEMS, canonicalItem(id)));
  return { text: list.slice(0, max).map(([id, n]) => `${n} ${name(id)}`).join(', '), more: Math.max(0, list.length - max) };
}
