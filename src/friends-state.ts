import { ITEMS, canonicalItem, type ItemId, type PlanetId } from './content.ts';

/**
 * Rescued friends' saved state (FRIENDS-CONTRACT.md). Kept apart from friends.ts, which needs model.ts, so model.ts can
 * parse it without an import cycle (the helper-state.ts pattern). Saves from before the rescue have no `friends` and no
 * `bosses`: both parse as empty, so nobody is rescued and every cage starts locked.
 */
export type FriendId = 'sprout' | 'clover' | 'pepper';
export type FriendRole = 'garden' | 'farm' | 'cook';
export type FriendSlot = 'hat' | 'outfit' | 'boots' | 'pet' | 'weapon';
export interface Friend {
  id: FriendId; role: FriendRole;
  rescuedAt: number;
  /** Gear the player gave this friend: the same slot keys and item ids as SaveState.gear (no disguise). */
  gear: Partial<Record<FriendSlot, ItemId>>;
  /** False while the friend still follows the explorer home; true once it has reached the village and its post. */
  home?: boolean;
  /** The per-friend pause: a paused friend stands at its post and touches nothing. */
  paused?: boolean;
  /** The farmer only feeds animals when the player turns this on (off by default, like the pen robot's autoFeed). */
  autoFeed?: boolean;
  /** Work done "today" (UTC day number `day`), for the status line. */
  day?: number; done?: number;
  /** The cook's odd items waiting for a partner (0 or 1 per item), so "half, rounded down" holds across batches. */
  carry?: Record<string, number>;
  /** The cook's share of farm products set aside for a dish (they stay in the bag until the dish is made). */
  pot?: Record<string, number>;
}
export const FRIEND_IDS: readonly FriendId[] = ['sprout', 'clover', 'pepper'];
/** Shirt (`tint`) and hair colours: each differs from every explorer colour (model.ts COLORS) and the hero's brown hair, and none
 * is grass green, so a half-size friend still reads against the meadow: a lemon-and-ginger gardener, a rust-and-blond farmer, a chef in white. */
export const FRIENDS: Record<FriendId, { name: string; role: FriendRole; tint: string; hair: string }> = {
  sprout: { name: 'Sprout', role: 'garden', tint: '#ffe14d', hair: '#ff8c42' },
  clover: { name: 'Clover', role: 'farm', tint: '#d98a4e', hair: '#f2c14e' },
  pepper: { name: 'Pepper', role: 'cook', tint: '#f6f1e7', hair: '#2d2a44' },
};
/** Where each prisoner is kept: next to which boss on which planet (friends.ts explains the choices). */
export const CAGES: Record<FriendId, { planet: PlanetId; boss: string }> = {
  sprout: { planet: 'home', boss: 'treant' },
  clover: { planet: 'home', boss: 'bear' },
  pepper: { planet: 'toy', boss: 'robot' },
};
export const FRIEND_SLOTS: readonly FriendSlot[] = ['hat', 'outfit', 'boots', 'pet', 'weapon'];
/** The friend slot an item goes in (its own SaveState.gear slot); disguises and non-gear are not for friends. */
export function friendSlot(raw: ItemId): FriendSlot | null {
  const slot = ITEMS[canonicalItem(raw)]?.slot;
  return slot && (FRIEND_SLOTS as readonly string[]).includes(slot) ? slot as FriendSlot : null;
}

/** A defeated boss as `planet:type`; called by model.ts grantDefeat (offline and on the server alike). */
export function noteBossDefeat(s: { planet: PlanetId; bosses?: string[] }, type: string) {
  const key = `${s.planet}:${type}`; s.bosses ??= [];
  if (!s.bosses.includes(key) && s.bosses.length < 64) s.bosses.push(key);
}
export function parseBosses(raw: unknown): string[] {
  return Array.isArray(raw) ? [...new Set(raw.filter((v): v is string => typeof v === 'string' && /^[a-z]+:[a-z_]+$/.test(v)))].slice(0, 64) : [];
}
const count = (raw: unknown, max: number) => typeof raw === 'number' && Number.isSafeInteger(raw) && raw >= 0 ? Math.min(raw, max) : 0;
function smallCounts(raw: unknown, max: number) {
  const out: Record<string, number> = {};
  if (raw && typeof raw === 'object' && !Array.isArray(raw))
    for (const [k, v] of Object.entries(raw).slice(0, 32)) { const id = canonicalItem(k), n = count(v, max); if (n && Object.hasOwn(ITEMS, id)) out[id] = n; }
  return out;
}
/** Validates saved friends (or a visitor's copy); unknown ids, duplicates and bad gear are dropped. */
export function parseFriends(raw: unknown): Friend[] {
  if (!Array.isArray(raw)) return [];
  const out: Friend[] = [];
  for (const v of raw.slice(0, 8)) {
    if (!v || typeof v !== 'object') continue;
    const r = v as Record<string, unknown>, id = r.id as FriendId;
    if (!FRIEND_IDS.includes(id) || out.some(f => f.id === id)) continue;
    const f: Friend = { id, role: FRIENDS[id].role, rescuedAt: Number.isFinite(r.rescuedAt) ? r.rescuedAt as number : 0, gear: {}, home: r.home === true, paused: r.paused === true };
    if (r.autoFeed === true) f.autoFeed = true;
    if (r.gear && typeof r.gear === 'object' && !Array.isArray(r.gear))
      for (const [slot, item] of Object.entries(r.gear)) if (typeof item === 'string' && friendSlot(item) === slot) f.gear[slot as FriendSlot] = canonicalItem(item);
    const day = count(r.day, 1e7); if (day) { f.day = day; f.done = count(r.done, 1e6); }
    if (id === 'pepper') { f.carry = smallCounts(r.carry, 1); f.pot = smallCounts(r.pot, 3); }
    out.push(f);
  }
  return out;
}
